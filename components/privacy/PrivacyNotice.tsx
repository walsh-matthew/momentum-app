import Link from 'next/link';
import {
  ANTHROPIC_TERMS,
  DELETION_WITHIN_DAYS,
  DEVICE_STORAGE,
  GOOGLE_TESTING_LINE,
  GUIDED_SETUP_LINE,
  NEVER_SENT,
  NOTICE_CHANGE_LINE,
  PROMPTS,
  PROVIDER_NOTICES,
  SERVICES,
  STORED_GROUPS,
  TERMS_CHECKED_ON,
  joinWords,
} from '@/lib/config/privacy';

// The public privacy notice (MOM-102), in plain words. Every fact on this page comes from lib/config/privacy.ts, and
// tests/privacy-sync.test.ts, tests/rebalance-model.test.ts and tests/task-plan-ai.test.ts fail when the code stops
// matching that file, so the page cannot drift from what Momentum does. It names no tester and says nothing about
// anyone's age or household.

const LINK_CLASS = 'underline underline-offset-2 hover:text-foreground';
const SECTION_CLASS = 'flex flex-col gap-2';
const H2_CLASS = 'text-base font-semibold tracking-[-0.02em]';
const LIST_CLASS = 'ml-5 list-disc space-y-1';

export function PrivacyNotice() {
  return (
    <article className="flex flex-col gap-6 text-sm leading-relaxed [overflow-wrap:anywhere]">
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
        <ul className={LIST_CLASS}>
          {STORED_GROUPS.map((group) => (
            <li key={group.id}>{group.words}</li>
          ))}
        </ul>
      </section>

      <section className={SECTION_CLASS} aria-labelledby="connected">
        <h2 id="connected" className={H2_CLASS}>
          What comes from services you connect
        </h2>
        <p>Only if you connect them. Your own key or sign-in token is kept on the server and is never sent to Claude.</p>
        <ul className={LIST_CLASS}>
          {Object.entries(PROVIDER_NOTICES).map(([id, provider]) => (
            <li key={id}>
              <strong>{provider.name}:</strong> for each {provider.record}, {joinWords(provider.stores)}. Not stored:{' '}
              {provider.leavesOut}.{id === 'google_calendar' ? ` ${GOOGLE_TESTING_LINE}` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section className={SECTION_CLASS} aria-labelledby="claude">
        <h2 id="claude" className={H2_CLASS}>
          What is sent to Claude (Anthropic)
        </h2>
        <p>Some features ask Claude, a model made by Anthropic, to write a suggestion. Each one sends only what it needs:</p>
        <ul className={LIST_CLASS}>
          {Object.entries(PROMPTS).map(([id, prompt]) => (
            <li key={id}>
              <strong>{prompt.title}:</strong> {joinWords(prompt.sends)}.
              {prompt.leavesOut ? ` Not ${prompt.leavesOut}.` : ''}
              {prompt.note ? ` ${prompt.note}` : ''}
            </li>
          ))}
          <li>{GUIDED_SETUP_LINE}</li>
        </ul>
        <p>Never sent: {NEVER_SENT}.</p>
        <p>
          Anthropic&apos;s terms for its API, quoted as checked on {TERMS_CHECKED_ON}. This is not legal advice, and
          terms can change:
        </p>
        <ul className={LIST_CLASS}>
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
        <p>These services handle your data on Momentum&apos;s behalf, besides Anthropic (above):</p>
        <ul className={LIST_CLASS}>
          {Object.entries(SERVICES).map(([id, service]) => (
            <li key={id}>
              <strong>{service.name}:</strong> {service.does}.
            </li>
          ))}
        </ul>
      </section>

      <section className={SECTION_CLASS} aria-labelledby="device">
        <h2 id="device" className={H2_CLASS}>
          On your device
        </h2>
        <p>Momentum keeps these in your browser:</p>
        <ul className={LIST_CLASS}>
          {DEVICE_STORAGE.now.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
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
        <p>{NOTICE_CHANGE_LINE}</p>
        <p>Last reviewed {TERMS_CHECKED_ON}.</p>
        <Link href="/login" className={LINK_CLASS}>
          Back to sign in
        </Link>
      </footer>
    </article>
  );
}
