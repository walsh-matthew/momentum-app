// MOM-113 block 3.3: layer 2 of the weekly review, the one line Claude writes about the week. The person taps for it; this reads
// their review on the server (getWeeklyReviewFacts), keeps only the facts the privacy notice lists (lib/review/reflection.ts)
// and asks through runReviewLine() in lib/services/llm.ts, which applies the review's limits and budget and logs the call.
// Nothing the browser sends reaches the prompt, and the line is not stored: a finished review stores the recap, not Claude's words.

import { buildReflectionFacts } from '@/lib/review/reflection';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { runReviewLine, type ReviewLineResult, type RunReviewLineDeps } from './llm';
import type { ServiceResult } from './result';
import { getWeeklyReviewFacts, type WeeklyReviewFactsDeps } from './review';

const SIGNED_OUT = 'Sign in to get a line for your weekly review.';
const NOT_READY = 'There is no weekly review to add a line to right now.';
const NOT_OFFERED = 'Your review depth is set to the recap only, so no line is offered.';
const NOTHING_TO_SAY = 'No target finished a week in this period, so there is nothing for a line to look back on.';

export interface ReviewLineDeps extends WeeklyReviewFactsDeps {
  // The Claude call and its clock, swappable in tests. Never set from a request.
  line?: RunReviewLineDeps;
}

export async function getReviewLine(deps: ReviewLineDeps = {}): Promise<ServiceResult<ReviewLineResult>> {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return { ok: false, error: SIGNED_OUT };

  const read = await getWeeklyReviewFacts(deps);
  if (!read.ok) return read;
  const review = read.data;
  if (review.state !== 'ready') return { ok: false, error: NOT_READY };
  if (!review.offerReflection) return { ok: false, error: NOT_OFFERED };

  const facts = buildReflectionFacts(review.recap, review.targets, review.tone);
  if (facts.targets.length === 0) return { ok: false, error: NOTHING_TO_SAY };

  return { ok: true, data: await runReviewLine({ userId: auth.user.id, facts }, deps.line) };
}
