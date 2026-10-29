// The small pure pieces behind the guided setup screen (MOM-111): the conversation steps the screen takes, the quick path's
// plain-words missing list, the two validator rules added for saving (a synced source must be one the app can connect, and an
// item with steps must feed a checklist target), step 9's and step 6's wording, and the suggested start date that goes to
// Claude. Everything here is pure; no model, no database, no network.

import { describe, expect, it } from 'vitest';
import { buildSetupMessages } from '@/lib/ai/setup';
import { emptyDraft } from '@/lib/setup/draft';
import { runSetupEval } from '@/lib/setup/evals';
import { CHUNK_TITLES, describeMissing, quickPathSections } from '@/lib/setup/quickPath';
import { SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import {
  APPROVE_TEXT,
  awaitsClaude,
  currentTurn,
  newSession,
  parseStoredSession,
  withAssistantTurn,
  withPersonMessage,
} from '@/lib/setup/session';
import { SETUP_STEPS } from '@/lib/setup/steps';
import { acceptsText } from '@/lib/setup/text';
import { validateDraft } from '@/lib/setup/validate';
import { SETUP_CHUNKS, SetupSessionSchema, type SetupDraft, type SetupSession, type Transcript } from '@/types/setup';
import { SETUP_CASES } from './setup-evals/cases';
import { scriptedModel } from './helpers/setupScript';

// One whole validated conversation, loaded when the file is (the tables below are built at that time).
const scriptedCase = SETUP_CASES.find((x) => x.expect === 'clean');
if (!scriptedCase) throw new Error('no clean case');
const report = await runSetupEval(scriptedCase, scriptedModel(scriptedCase.script));
const script = scriptedCase.script;
const transcript: Transcript = report.transcript;
const draft: SetupDraft = report.draft;

describe('the conversation steps the screen takes', () => {
  it('starts empty, with nothing chosen', () => {
    const s = newSession();
    expect(s).toEqual({ transcript: [], draft: emptyDraft(), spentTokens: 0 });
    expect(awaitsClaude(s)).toBe(true);
    expect(currentTurn(s)).toBeNull();
  });

  it('appends the person\'s words trimmed, and changes nothing else, without touching the session it was given', () => {
    const s = withAssistantTurn(newSession(), script[0], 1200);
    const next = withPersonMessage(s, '  Run more  ');
    expect(next.transcript).toEqual([...s.transcript, { role: 'person', text: 'Run more' }]);
    expect(next.draft).toBe(s.draft);
    expect(next.spentTokens).toBe(1200);
    expect(s.transcript).toHaveLength(1);
    expect(awaitsClaude(next)).toBe(true);
    expect(currentTurn(next)).toBeNull();
  });

  it('takes Claude\'s draft as the draft: the newest whole one, never a merge, so the latest answer wins', () => {
    const early = withAssistantTurn(newSession(), script[2], 100);
    const later = withAssistantTurn(withPersonMessage(early, 'Actually, something else'), script[4], 300);
    expect(later.draft).toEqual(script[4].draft);
    expect(later.draft).not.toEqual(script[2].draft);
    expect(later.spentTokens).toBe(300);
    expect(currentTurn(later)).toEqual(script[4]);
    expect(awaitsClaude(later)).toBe(false);
  });

  it('keeps the approval sentence something the rule checks accept as a yes', () => {
    expect(acceptsText(APPROVE_TEXT)).toBe(true);
  });
});

describe('what this tab stored', () => {
  const stored = (): SetupSession => ({ transcript: transcript.slice(0, 4), draft: script[1].draft, spentTokens: 2500 });

  it('reads back a valid conversation', () => {
    expect(parseStoredSession(JSON.stringify(stored()))).toEqual(stored());
  });

  it.each([
    ['nothing', null],
    ['text that is not JSON', 'not json'],
    ['the wrong shape', '{"transcript": "x"}'],
    ['an empty conversation', JSON.stringify(newSession())],
    ['a conversation that does not alternate', JSON.stringify({ ...stored(), transcript: [transcript[0], transcript[0]] })],
    ['a key it does not know', JSON.stringify({ ...stored(), userId: 'someone' })],
    ['a negative token count', JSON.stringify({ ...stored(), spentTokens: -5 })],
  ])('drops %s, so the person starts again instead of the screen breaking', (_label, raw) => {
    expect(parseStoredSession(raw as string | null)).toBeNull();
  });

  it('is the same schema the server reads', () => {
    expect(SetupSessionSchema.safeParse(stored()).success).toBe(true);
    expect(SetupSessionSchema.safeParse({ ...stored(), transcript: [{ role: 'person', text: 'x'.repeat(2001) }] }).success).toBe(false);
  });
});

describe('the quick path', () => {
  it('plays back all four parts in order, written by code', () => {
    const sections = quickPathSections(draft.model);
    expect(sections.map((s) => s.chunk)).toEqual([...SETUP_CHUNKS]);
    expect(sections.map((s) => s.title)).toEqual(SETUP_CHUNKS.map((c) => CHUNK_TITLES[c]));
    for (const s of sections) expect(s.lines.length).toBeGreaterThan(0);
  });

  it('says what is missing in plain words, once each, with the person\'s own titles, and ignores the approvals', () => {
    const goal = draft.model.goals[0];
    const target = goal.targets[0];
    const lines = describeMissing(
      draft.model,
      [
        { path: 'person.timeZone', message: 'Ask the time zone before a target is saved.' },
        { path: 'person.timeZone', message: 'again' },
        { path: 'person.dayEnd', message: 'x' },
        { path: 'person.weekStart', message: 'x' },
        { path: `goals.${goal.key}.startDate`, message: 'x' },
        { path: `goals.${goal.key}.targets.${target.key}.sources`, message: 'x' },
        { path: `goals.${goal.key}.targets.${target.key}.floor`, message: 'x' },
        { path: 'goals', message: 'x' },
        { path: 'approved.goals', message: 'x' },
        { path: 'something.else', message: 'x' },
      ].map((issue) => ({ ...issue, code: 'rule' as const })),
    );
    expect(lines).toEqual([
      'Your time zone.',
      'When your day ends.',
      'Which day your week starts.',
      `A start date for "${goal.title}".`,
      `Where "${target.title}" is tracked.`,
      `The least you aim for with "${target.title}".`,
      'At least one goal.',
      'Something in your answers needs another look.',
    ]);
    for (const line of lines) expect(line).not.toMatch(/^Ask |draft|\bgoals\./);
  });

  it('is empty for a draft that can be saved', () => {
    const all = { ...draft, approved: [...SETUP_CHUNKS] };
    expect(describeMissing(draft.model, validateDraft(all, transcript, 'final').issues)).toEqual([]);
  });
});

describe('the validator rules added for saving', () => {
  const issuesFor = (mutate: (m: SetupDraft['model']) => void, mode: 'progress' | 'final') => {
    const model = structuredClone(draft.model);
    mutate(model);
    return validateDraft({ ...draft, model }, transcript, mode).issues;
  };

  it('starts clean, so a failure below is the mutation', () => {
    expect(validateDraft(draft, transcript, 'final').issues).toEqual([]);
  });

  it('refuses a synced source the app cannot connect (a supported one is fine), in both modes', () => {
    for (const mode of ['progress', 'final'] as const) {
      const bad = issuesFor((m) => (m.goals[0].targets[0].sources = [{ kind: 'synced', provider: 'strava', metric: null }]), mode);
      // The message names no value: a thrown-away reply is retried with it (MOM-111 root cause A).
      expect(bad.map((i) => i.message)).toContain('That app cannot be connected yet. Offer logging it themselves for now.');
      const ok = issuesFor(
        (m) => (m.goals[0].targets[0].sources = [{ kind: 'synced', provider: 'hevy', metric: 'volume_lbs' }, { kind: 'manual' }]),
        mode,
      );
      expect(ok).toEqual([]);
    }
  });

  it('refuses a quantity target bound to Hevy with no metric named, only at the end, and only for an app with metrics to choose', () => {
    const noMetric = (m: SetupDraft['model']) => (m.goals[0].targets[0].sources = [{ kind: 'synced', provider: 'hevy', metric: null }]);
    expect(issuesFor(noMetric, 'progress')).toEqual([]);
    expect(issuesFor(noMetric, 'final').map((i) => i.message)).toContain('Ask which number counts for this target in that app.');

    // Google Calendar has nothing to choose between, so naming it with no metric is never an issue.
    const google = (m: SetupDraft['model']) => (m.goals[0].targets[0].sources = [{ kind: 'synced', provider: 'google_calendar', metric: null }]);
    expect(issuesFor(google, 'final')).toEqual([]);
  });

  it('refuses an item with steps that feeds a target that is not a checklist, in both modes', () => {
    const toCount = (m: SetupDraft['model']) => {
      const g = m.goals[0];
      g.items.push({ key: 'list', kind: 'milestone', title: 'Get ready', targetKey: g.targets[0].key, dueDate: null, dateCanMove: null, estimateMinutes: null, steps: ['Pack'] });
    };
    for (const mode of ['progress', 'final'] as const) {
      expect(issuesFor(toCount, mode).map((i) => i.message)).toContain('An item with steps feeds a checklist target.');
    }
  });

  it('lets an item with steps wait for its target while Claude is still filling the draft, but not at the end', () => {
    const noTarget = (m: SetupDraft['model']) => {
      m.goals[0].items.push({ key: 'list', kind: 'milestone', title: 'Get ready', targetKey: null, dueDate: null, dateCanMove: null, estimateMinutes: null, steps: ['Pack'] });
    };
    expect(issuesFor(noTarget, 'progress')).toEqual([]);
    expect(issuesFor(noTarget, 'final').map((i) => i.message)).toContain('An item with steps must feed a checklist target, so its steps can be ticked.');
  });
});

describe('the wording of step 9 and step 6', () => {
  const step = (n: number) => SETUP_STEPS.find((s) => s.n === n)?.summary ?? '';

  it('step 9 asks "Where do you track this now, if anywhere?" as one question and names no older wording', () => {
    expect(step(9)).toContain('"Where do you track this now, if anywhere?"');
    expect(step(9)).not.toMatch(/already tracking|Where do you already|two asks|the doc/i);
    expect(SETUP_SYSTEM_PROMPT).toContain('Where do you track this now, if anywhere?');
    expect(SETUP_SYSTEM_PROMPT).not.toMatch(/Are you already tracking/);
  });

  it('step 6 offers the suggested date, lets the person give an earlier one, and leaves working a date out to code (MOM-111 finding 8)', () => {
    expect(step(6)).toContain('"Suggested start date"');
    expect(step(6)).toMatch(/earlier date/);
    expect(step(6)).toMatch(/Never work a date out yourself/);
    expect(step(6)).toMatch(/code works the date out/);
    expect(step(6)).toMatch(/record it only after they accept/);
    expect(step(6)).not.toMatch(/Propose today/);
  });
});

describe('the suggested start date that goes to Claude', () => {
  const lastText = (messages: ReturnType<typeof buildSetupMessages>): string => {
    const last = messages[messages.length - 1];
    return typeof last.content === 'string' ? last.content : last.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  };

  it('is one labelled line after the draft, with the casual words to say it in, and only when the browser sent one', () => {
    const withDate = lastText(buildSetupMessages(transcript.slice(0, 2), draft, { today: '2026-10-28' }));
    expect(withDate).toContain("\nSuggested start date (today's date on the person's device, a suggestion only): 2026-10-28.");
    // MOM-111 finding 7: Claude is told how to say it, so the ISO date never reaches the screen.
    expect(withDate).toContain('Say it as "today, Wednesday, Oct 28", never as 2026-10-28.');
    expect(withDate.indexOf('Current draft')).toBeLessThan(withDate.indexOf('Suggested start date'));
    const without = lastText(buildSetupMessages(transcript.slice(0, 2), draft));
    expect(without).not.toContain('Suggested start date');
  });

  it('sends the person\'s own words apart from it', () => {
    const messages = buildSetupMessages(transcript.slice(0, 2), draft, { today: '2026-10-28' });
    const last = messages[messages.length - 1];
    expect(Array.isArray(last.content)).toBe(true);
    if (Array.isArray(last.content)) {
      expect(last.content[0]).toMatchObject({ type: 'text' });
      expect((last.content[0] as { text: string }).text).not.toContain('Suggested start date');
    }
  });
});

describe('a synced source is never shown as connected', () => {
  // The save records which app the person says they track a target in. Whether that app is connected is read from the
  // person's connections, never from this record, so nothing setup shows may say or imply it is.
  it('the playback says where a target is tracked and never that it is connected', () => {
    const model = structuredClone(draft.model);
    const target = model.goals.flatMap((g) => g.targets)[0];
    target.sources = [{ kind: 'synced', provider: 'hevy', metric: 'volume_lbs' }, { kind: 'manual' }];
    const lines = [...quickPathSections(model).flatMap((s) => s.lines)];
    const tracked = lines.find((l) => l.startsWith(`${target.title}: read from`));
    expect(tracked).toBe(`${target.title}: read from Hevy and you log it yourself.`);
    for (const line of lines) expect(line).not.toMatch(/connect|synced|syncing|linked/i);
  });

  it('nothing in the setup screen\'s own words says a source is connected', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'components', 'setup');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.tsx'))) {
      const text = readFileSync(join(dir, file), 'utf8').replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
      expect(text, file).not.toMatch(/\bconnected\b/i);
    }
  });
});
