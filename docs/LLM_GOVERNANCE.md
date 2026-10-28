# Claude calls: limits, caps, usage log, SDK and fallback decision

MOM-73. Covers the places the app calls Claude: the rebalance proposal ("Ask Claude to review", `lib/ai/rebalance.ts`), the goal wizard's week 1 plan (`lib/ai/taskPlan.ts`) and, since MOM-128, a turn of guided setup (`lib/ai/setup.ts`), which has limits of its own: see [Guided setup](#guided-setup-mom-128). Code: `lib/services/llm.ts`. Database: migration `011_llm_usage_logs.sql` (and `014_setup_budget.sql`, which adds the `setup` feature), checked by `supabase/verify/011_llm_usage_logs.sql` and `014_setup_budget.sql`.

The rest of this page, up to "Guided setup", describes the rebalance and week 1 plan and is unchanged by MOM-128.

## What was wrong

Each call is a paid request. The only brake was "one request per user every 20 seconds", kept in server memory, so it was per serverless instance and reset on every cold start. Nothing capped total spend, and nothing recorded tokens or latency, so cost could not even be measured.

## What happens now

Every Claude call goes through `runWithinBudget()` in `lib/services/llm.ts`:

1. **Before the call**, the database function `reserve_llm_call()` checks three limits and, if they pass, inserts a `pending` usage row, in one transaction under one lock. Two instances asking at the same moment queue, so only one can pass. If a limit trips, the model is **not called** and the result says which limit and when the same ask could next pass.
2. **The call** is unchanged.
3. **After the call**, the pending row is filled in with the outcome, the token counts the API reported, and the latency.

If the usage table cannot be reached, or answers in a shape we do not recognise, the model is **not called** (fail closed). A spend cap that stops working when its counter is down is not a cap.

### The limits (placeholders, set in one place: `LLM_LIMITS` in `lib/services/llm.ts`)

| Limit | Value | Reported as |
|---|---|---|
| Spacing between one user's calls | 20 seconds | `too_soon` |
| Calls per user | 20 in any 24 hours | `user_daily` |
| Calls by everyone together | 200 in any 24 hours | `overall_daily` |

- **Order of checks:** your own cap, then the shared cap, then spacing, so the most useful reason is the one reported.
- **Rolling 24 hours**, not a calendar day: no midnight reset spike, and no dependence on a time zone.
- **What counts:** every row, finished or pending, whatever its outcome. A failed call is still a call. A row left `pending` by a crash still counts, which is the safe way round for a cap.
- **What does not count:** a refused attempt writes nothing, so asking again cannot extend your own wait. A bad channel id, bad wizard input or a signed-out request is refused before anything is reserved, so it uses up nothing.
- **Calls, not tokens, are counted.** A count can be enforced before the call is made. The tokens are logged so the cost can be worked out and the caps tuned from it.

**Reading the caps as money.** From the Claude API reference's price table (cached 2026-10-06; check it is current), `claude-opus-5-5` costs $4 per million input tokens and $20 per million output tokens. The output limit per call is 16,000 tokens, so output alone is at most $0.32 a call. That puts the ceilings, before input cost, at about **$6.40 per user per rolling 24 hours** and about **$64 overall**. Those are upper bounds that assume every call uses its whole output limit. Real cost is expected to be well below that but has not been measured (one real call has ever been made). Once the log has data, `llm_usage_daily` (below) gives the real figure, and the numbers can be set from it.

## What the user is told

The text is composed on the server and shown as it is: the wizard prints the message followed by "Nothing was saved or substituted.", and the rebalance drawer prints the notice or the alert as written. No UI change was needed. A wait is rounded **up** so it never promises a time before the limit frees up (minutes up to 90, then hours).

| Limit | Rebalance ("Ask Claude") | Plan generation (wizard) |
|---|---|---|
| 20 second spacing | Error: "Please wait a few seconds before asking again." (as before) | The same message |
| Your daily cap | The rule-based proposal, **labelled**: "You've used all 20 of your Claude requests for the last 24 hours, so this is the rule-based suggestion. You can ask again in about 60 minutes." | A message only: "You've used all 20 of your Claude requests for the last 24 hours. You can ask again in about 60 minutes." |
| The shared daily cap | The rule-based proposal, labelled: "Claude is at its shared limit for everyone right now, so this is the rule-based suggestion. Try again in about 8 hours at the earliest." | A message only: "Claude is at its shared limit for everyone right now. Try again in about 8 hours at the earliest." |
| Limits cannot be checked | The rule-based proposal, labelled: "Claude's usage limits could not be checked, so this is the rule-based suggestion." | A message only: "Claude plans can't be used right now because their usage limits could not be checked." |

- **For your own cap the time is exact** (nothing else can use it). **For the shared cap it is an earliest time**, because other people may use the room that frees up first, and the wording says so.
- **Rebalance may fall back** to the rule-based proposal because that is free, instant, already validated, and always labelled (`source: 'rules'`, `model: null`, and the notice). It is never silent.
- **Plan generation never gets a plan from a limit.** The wizard keeps "Use the starter plan instead" as a choice the person makes themselves; nothing is substituted for them. Its Try again button remains; after a daily cap it simply shows the same message again, at no cost.
- The 20 second spacing stays an error for the rebalance too: asking twice in a row is not a reason to switch to a different kind of answer.

## What is recorded, and who can see it

Table `llm_usage_logs`, one row per call: `user_id`, `feature` (`rebalance`, `week_one_plan` or `setup`), `model` (a model id, at most 100 characters), `input_tokens`, `output_tokens`, `latency_ms`, `outcome` (`pending`, `ok`, `refused`, `provider_rate_limited`, `unavailable`, `bad_output`, `not_configured`), `created_at`.

**No prompt and no answer, anywhere.** The table has no column that could carry either (no json, bytea, array or long-text column), the service passes only the fields above, and the tests read both the rows and the source to check it. The only text columns hold a fixed word or a model id.

| Who | Access |
|---|---|
| Signed-out client (`anon`) | Nothing |
| Signed-in user (`authenticated`) | Read **their own** rows only (row level security). Cannot insert, update or delete, and cannot call `reserve_llm_call()` |
| Server code (`service_role`) | Read, insert, update. No delete. The only caller of `reserve_llm_call()` |

The signed-in user cannot reserve calls on purpose. If a browser could, any account could fill the shared cap and switch Claude off for everyone.

A finished row can never change, and a pending row can only be given its result (never a new user, feature, model or time), so a row cannot be backdated to dodge a limit.

**Reading it:**
- A person reads their own calls with `listMyLlmUsage()` in `lib/services/llm.ts` (also directly from the API under row level security). There is no screen for it yet.
- The owner reads totals with the view `llm_usage_daily` (calls, tokens, average latency per UTC day, feature and model), in the Supabase SQL editor. Only the SQL editor and the service role can read it:

  ```sql
  select * from public.llm_usage_daily order by day desc;
  ```

## Decisions

### SDK: keep `@anthropic-ai/sdk`

The ticket named the Vercel AI SDK; the code uses the official `@anthropic-ai/sdk`, which `CLAUDE.md` allows ("Claude API / Vercel AI SDK"). It stays, because:
- both call sites already use its structured outputs (`output_config.format` with a Zod schema) and its typed errors (`RateLimitError`, `AuthenticationError`, `APIError`), and the failure handling depends on them;
- a wrapper SDK would add a layer between the app and the API for no feature the app uses;
- the limits and the usage log live around the call, so they do not depend on which SDK makes it, and switching later would not touch them.

Revisit if the project ever needs several providers behind one interface.

### Server-side fallbacks (`fallbacks`): not enabled

Anthropic's API can re-run a request that a safety classifier declined on another model, inside the same call. It is **not** enabled, for these reasons:
- It needs a beta header and is only on the Claude API (not Bedrock, Vertex or Foundry), and it is rejected on the Batches API. According to the Claude API reference there are two forms with two different headers (`fallbacks: "default"` with `server-side-fallback-2026-07-01`, and an array of models with `server-side-fallback-2026-06-01`), and mixing a form with the other's header is an error. **None of this has been tested here.**
- Testing it means real, paid calls that provoke a refusal. That needs the owner's approval and has not been given.
- The app already has a fallback it controls and shows: a refusal comes back as `stop_reason: 'refusal'`, the rebalance then shows the labelled rule-based proposal, and the wizard shows a message and leaves the starter plan as the person's choice. A server-side fallback would instead put a different model's answer in front of the same validation without the person knowing, which is the silent substitution this product avoids. If it is ever turned on, the response must be checked for its `fallback` block and the answer labelled with the model that gave it.
- The usage log now records `refused` outcomes, so how often refusals happen can be measured before deciding.

Revisit when the log shows refusals are common enough to matter, and then test it against the real API with the owner's approval first.

### Why these other choices

- **A table plus a function**, not a key-value store: the project already has Postgres, the log has to exist anyway, and one transaction gives the check-and-reserve atomicity the limit needs without a new service.
- **The service-role client, in one module**: only server code may reserve calls. `lib/services/llm.ts` is the only place on the Claude path that holds it; `tasks.ts` does not, and a test checks that.
- **Fail closed**: see above.

## Guided setup (MOM-128)

Why setup has its own limits: a real setup is one conversation of about 20 to 25 Claude turns, a few seconds apart. The limits above (20 calls a day, 20 seconds apart) would stop it partway, so a tester could be cut off in the middle (RAID R-22). Design record `docs/design/2026-10-26-goal-model-design.md` §6.2 decided the shape; this is how it is built. Code: `runSetupTurn()` in `lib/services/llm.ts`. It is the only caller of `lib/ai/setup.ts`, and a test checks that.

| Rule | What it does | Where |
|---|---|---|
| **Per-person limits: log-only** | The person's daily count and the spacing between calls are set so high (and so low) that the database never refuses on them. Every call is still recorded as `setup`, so the log shows where production limits belong. | `SETUP_LIMITS` |
| **One hard shared cap** | Everyone's calls together, across every feature, still stop at the shared cap (200 in any 24 hours today). It is the spend backstop if sign-up is abused. | `SETUP_LIMITS.overallDailyCap` is `LLM_LIMITS.overallDailyCap` |
| **A per-setup budget** | One setup (first turn to save or abandon) may use at most 40 Claude turns and 1,000,000 tokens (input plus output). When a setup has used it, the next call is not made and nothing is reserved. | `SETUP_BUDGET` |
| **Fall back to the quick path** | When the budget is used up, the shared cap is reached or the limits cannot be checked, setup stops using Claude and offers the quick path: it plays back what the person has said so far (written by code from the validated draft), offers sensible defaults they can see and change, and saves nothing until they approve. | `SETUP_QUICK_PATH_MESSAGES` |

**The budget numbers are placeholders.** 40 turns and 1,000,000 tokens are starting values, not measurements. They are to be replaced by the 90th percentile of live eval runs plus a margin the owner approves (design record §6.2 step 2). No live run has set them yet; the results of any run go on the Jira ticket, not in the repo.

**Two requests in the same second** are not a reason to leave the conversation: the second gets "Please wait a few seconds before asking again." and the person asks again. That is the only per-person spacing left (1 second, the smallest the database function accepts).

**What counts as a turn and the tokens.** A turn is one of Claude's replies in the transcript the caller passes in. The tokens spent so far come back from every call (`spentTokens`) for the caller to hand in again. A token count that is not a whole, non-negative number is treated as used up.

**Who carries the budget.** The conversation, not the server: a setup is stored nowhere until the person approves it, so the budget is carried by the client. A modified client could reset it. That is acceptable because the budget is a cost and fairness control for honest testers; the hard shared cap is the real backstop and cannot be reset from the client. If setups ever need a server-side budget, they need a setup id on the usage log (a migration).

**What is sent each turn** (cost, and the privacy notice): the fixed setup prompt (which includes the exact shape of a reply and of the draft, written from the zod schemas in `types/setup.ts` by `lib/setup/schemaText.ts`, so it cannot drift from the validator; about 5,000 tokens in all), the person's messages, Claude's earlier turns *without their drafts* (each is replaced by a short note) and the current draft once, at the end of the newest message. Before MOM-128 every earlier turn carried its whole draft, so the request grew with the square of the number of turns. Nothing else is sent: no other goals, tasks, ids or email.

**The shared cap and the old features.** Every row counts toward a person's daily count whatever its feature, so a person who has done a 25-turn setup has also used up that day's 20 rebalance and week 1 plan calls. Left as it is on purpose: those two features are retired by MOM-115. Noted in `BACKLOG.md`.

### Reading the log-only limits

Setup rows are ordinary rows in `llm_usage_logs` with `feature = 'setup'`. This shows, for each person, how many setup calls fell past the old daily cap and how many came closer together than the old spacing. Run it in the SQL editor:

```sql
with calls as (
  select user_id,
         count(*) over (partition by user_id order by created_at
                        range between interval '24 hours' preceding and current row) as in_last_24h,
         created_at - lag(created_at) over (partition by user_id order by created_at) as since_previous
  from public.llm_usage_logs
  where feature = 'setup'
)
select user_id,
       count(*) as setup_calls,
       count(*) filter (where in_last_24h > 20) as calls_past_the_old_daily_cap,
       count(*) filter (where since_previous < interval '20 seconds') as calls_closer_than_the_old_spacing
from calls
group by user_id;
```

The log has no setup id, so it cannot tell two setups by the same person apart; the per-setup budget is measured in the live eval runs, not here. Cost per day and model: `select * from public.llm_usage_daily where feature = 'setup' order by day desc;`.

### Prices used for the estimates

From the Claude API price table cached 2026-10-06 (check it is current): `claude-opus-5-5` $4 input and $20 output per million tokens; `claude-sonnet-5-5` $2 and $10; `claude-haiku-5-5` $0.10 and $0.50 (for prompts up to 100K tokens). `SETUP_MODEL` is `claude-opus-5-5`. The smaller-model trial (`model` argument of `runSetupTurn`) runs the same eval set on a cheaper model and keeps it only if it passes the same rule checks.

### Running the live eval (owner's OK first)

`npm run eval:setup:pilot` runs one full scripted case against the real model through `runSetupTurn()`, which makes real, paid calls. It is not part of `npm test` or CI. It will not run unless the Supabase address it uses is `127.0.0.1` or `localhost`: it ignores every Supabase value in `.env.local` (which points at production), takes the local stack's own address and keys from `npx supabase start`, and reads only the Anthropic key from `.env.local`. It stops by itself past an estimated $6, and a reply that is not a valid turn is asked for again up to twice, with every such reply counted in the report. `tests/setup-live.test.ts` proves the refusal.

## Changing a limit

Edit `LLM_LIMITS` in `lib/services/llm.ts` (rebalance and week 1 plan) or `SETUP_LIMITS` and `SETUP_BUDGET` (guided setup). Nothing in the database holds the numbers; the function takes them as arguments. The 24 hour window is fixed in the SQL function (a new migration is needed to change it). The user-facing wording reads the numbers, so the cap in the message follows the constant.

## Known gaps (also in BACKLOG.md)

- **Retention:** nothing deletes old usage rows, so the table grows without bound. They carry a user id (but no content) and go when the account is deleted. Decide how long to keep them (RAID log).
- **Cost is unmeasured:** the caps are ceilings, not forecasts. Set them from the first week of real data.
- **Open sign-up:** an attacker with many accounts can use up the shared cap and switch Claude off for everyone (the features then fall back or show messages; nothing breaks). Sign-up rate limiting is a separate open item (MOM-64).
- **No screen for usage:** `listMyLlmUsage()` exists; a Settings readout would be a UI ticket.
- **One lock for everything:** the check serializes all reservations on one lock for a few milliseconds each. That is fine at this scale; revisit if reservations ever become frequent.

## How it was checked

- `supabase/verify/011_llm_usage_logs.sql`: the column set (no content column), each role's privileges, every constraint, the finish guard, the limits and their precedence and retry times, and that API roles cannot reserve or write.
- A one-off run with eight genuinely parallel database sessions: eight calls from one user gave exactly one reservation; eight users racing a cap of "current plus three" gave exactly three.
- `tests/llm-governance.test.ts`: the limit across simulated instances and cold starts (including five instances asking at once), each limit at both call sites with the exact message, fail-closed, content-free rows, and source-level guards (no way to write `status` or `completed_at`, no unmetered call to either model function).
- `tests/migrations.test.ts`: the SQL still says what the fake and the service assume.
- `supabase/verify/014_setup_budget.sql` (MOM-128): `setup` is accepted and logged, anything else is still refused, and the goals checks that migration 014 changed (checked by removing each and seeing the script fail).
- `tests/setup-budget.test.ts` (MOM-128): a scripted 25-turn setup is not cut off by the per-person limits (and the same 25 turns are cut off by the old ones), the shared cap still stops calls, going over the budget falls back to the quick path, setup calls are logged as `setup`, and the old features keep their limits.
- `tests/setup-live.test.ts` (MOM-128): a live eval run refuses unless its Supabase address is local, whatever `.env.local` says.
