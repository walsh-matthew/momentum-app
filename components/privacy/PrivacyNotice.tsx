import Link from 'next/link';
import { ANTHROPIC_TERMS, DELETION_WITHIN_DAYS, TERMS_CHECKED_ON } from '@/lib/config/privacy';

// The public privacy notice (MOM-102), in plain words. Product-level only: it names no tester and says nothing about
// anyone's age or household. What it states about stored data and Claude prompts is pinned by tests/privacy-notice
// .test.tsx and tests/rebalance-model.test.ts, tests/task-plan-ai.test.ts, so a change to either has to change this.

const LINK_CLASS = 'underline underline-offset-2 hover:text-foreground';
const SECTION_CLASS = 'flex flex-col gap-2';
const H2_CLASS = 'text-base font-semibold tracking-[-0.02em]';

export function PrivacyNotice() {
  return (
    <article className="flex flex-col gap-6 text-sm leading-relaxed">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-[-0.03em]">Privacy notice</h1>
        <p className="text-muted">
          This says what Momentum keeps about you, what it sends to other companies, and how to have it deleted.
          Momentum is a trial. It is for adults only (18 or over).
        </p>
      </header>

      <section className={SECTION_CLASS} aria-labelledby="stores">
        <h2 id="stores" className={H2_CLASS}>
          What Momentum stores
        </h2>
        <ul className="ml-5 list-disc space-y-1">
          <li>Your account: your email address and a scrambled form of your password.</li>
          <li>Facts and settings you give it: the days you work, your priorities and how you want things handled.</li>
          <li>Your goals and the targets you set under them.</li>
          <li>Your work items and their steps.</li>
          <li>
            Entries and corrections: each record counted toward a target (a workout, a timer, a tap, a tick) and what
            you said about it, such as hiding it.
          </li>
          <li>
            Closed-period snapshots: a copy of a target as it stood when a period closed, so changing a target later
            does not re-grade the past.
          </li>
          <li>Your plan tasks and your weekly review notes.</li>
          <li>
            How many times you have asked Claude for help, and when (a count, with no questions or answers). These
            counts are kept until your account is deleted.
          </li>
        </ul>
      </section>

      <section className={SECTION_CLASS} aria-labelledby="connected">
        <h2 id="connected" className={H2_CLASS}>
          What comes from services you connect
        </h2>
        <p>Only if you connect them. Your own key or sign-in token is kept on the server and is never sent to Claude.</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Hevy (workouts):</strong> for each workout, its name, when it ended, how long it lasted, the total
            weight lifted, and the number of sets and exercises. Not exercise names, individual sets, notes or body
            measurements.
          </li>
          <li>
            <strong>Google Calendar:</strong> for each timed event, only the time block: its id, start, end and
            whether it was cancelled. Not the title, guests, description or place. While Momentum&apos;s Google access
            is in the provider&apos;s testing mode, it expires about every week and you will need to connect again.
          </li>
        </ul>
      </section>

      <section className={SECTION_CLASS} aria-labelledby="claude">
        <h2 id="claude" className={H2_CLASS}>
          What is sent to Claude (Anthropic)
        </h2>
        <p>Some features ask Claude, a model made by Anthropic, to write a suggestion. Each one sends only what it needs:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Rebalancing a plan:</strong> task ids, their weeks, types and due dates, and how many tasks were
            finished or left in each week. Not task titles, minutes or scores.
          </li>
          <li>
            <strong>Writing a first-week plan:</strong> what you type or pick in setup, including the title of your
            goal. Anything you type there goes to Anthropic, so leave out anything you would not want them to receive.
          </li>
          <li>Guided setup is a conversation with Claude. What you type during setup is sent to Anthropic.</li>
        </ul>
        <p>Never sent: your email, your passwords or tokens, other people&apos;s data, or workout and calendar details.</p>
        <p>
          Anthropic&apos;s terms for its API, quoted as checked on {TERMS_CHECKED_ON}. This is not legal advice, and
          terms can change:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            &ldquo;{ANTHROPIC_TERMS.noTraining.quote}&rdquo; (
            <a className={LINK_CLASS} href={ANTHROPIC_TERMS.noTraining.href} rel="noreferrer">
              {ANTHROPIC_TERMS.noTraining.where}
            </a>
            )
          </li>
          <li>
            &ldquo;{ANTHROPIC_TERMS.retention.quote}&rdquo; (
            <a className={LINK_CLASS} href={ANTHROPIC_TERMS.retention.href} rel="noreferrer">
              {ANTHROPIC_TERMS.retention.where}
            </a>
            ). {ANTHROPIC_TERMS.retention.exceptions}
          </li>
        </ul>
      </section>

      <section className={SECTION_CLASS} aria-labelledby="who">
        <h2 id="who" className={H2_CLASS}>
          Who can see your data
        </h2>
        <p>
          Each account sees only its own data. Nobody signed in to another account can see yours. The person who runs
          Momentum (the operator) can see stored rows only to give support, and only when you ask.
        </p>
        <p>
          Momentum runs on Vercel (hosting) and Supabase (database and sign-in email). Both handle your data on
          Momentum&apos;s behalf.
        </p>
      </section>

      <section className={SECTION_CLASS} aria-labelledby="delete">
        <h2 id="delete" className={H2_CLASS}>
          Getting your data deleted
        </h2>
        <p>
          For now, ask the person who invited you to the trial to delete all of your data. It is done within{' '}
          {DELETION_WITHIN_DAYS} days, and that removes your account and everything above. A way to delete your
          synced workouts and calendar records yourself, in the app, is planned.
        </p>
      </section>

      <footer className="flex flex-col gap-2 text-muted">
        <p>Last reviewed {TERMS_CHECKED_ON}.</p>
        <Link href="/login" className={LINK_CLASS}>
          Back to sign in
        </Link>
      </footer>
    </article>
  );
}
