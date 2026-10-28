// The setup prompt states the exact shape of a reply and of the draft, written from the zod schemas in types/setup.ts
// (lib/setup/schemaText.ts; MOM-128). The first live run failed because the prompt described the draft in prose only and
// the model invented its own field names. These tests hold the prompt to the validator's schema:
// - the field names and the allowed values in the prompt are, in order, the ones the schemas have, found by walking the
//   schemas through zod's own definition objects (not through the code that wrote the text, so a bug there shows);
// - the same comparison FAILS against a schema with a field added, so the test can fail;
// - real drafts from the eval set use only fields the prompt names;
// - the provenance path forms in the prompt are exactly the ones provenanceLeaves() produces, in both directions.
// Nothing here calls a model.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { emptyDraft } from '@/lib/setup/draft';
import { PROVENANCE_PATH_FORMS, provenanceLeaves } from '@/lib/setup/leaves';
import { DRAFT_SHAPE_TEXT, REPLY_SHAPE_TEXT, SETUP_SYSTEM_PROMPT } from '@/lib/setup/prompt';
import { renderSchema } from '@/lib/setup/schemaText';
import { AssistantTurnSchema, SetupDraftSchema, type SetupModel } from '@/types/setup';
import { goal, item, target } from './helpers/setupScript';
import { SETUP_CASES } from './setup-evals/cases';

// ---------------------------------------------------------------------------
// An independent reading of the schemas
// ---------------------------------------------------------------------------

interface Def {
  type: string;
  shape?: Record<string, z.ZodType>;
  innerType?: z.ZodType;
  element?: z.ZodType;
  options?: z.ZodType[];
  entries?: Record<string, string>;
  values?: unknown[];
}
const defOf = (s: z.ZodType): Def => (s as unknown as { _zod: { def: Def } })._zod.def;

// Every object key and every enum or literal value, in the order a reader of the schema meets them. A key in `skip` is
// listed but not entered (the reply names its draft instead of repeating it).
function walk(schema: z.ZodType, out: { keys: string[]; values: string[] }, skip: ReadonlySet<string> = new Set()): void {
  const d = defOf(schema);
  switch (d.type) {
    case 'object':
      for (const [key, child] of Object.entries(d.shape ?? {})) {
        out.keys.push(key);
        if (!skip.has(key)) walk(child, out, skip);
      }
      break;
    case 'nullable':
    case 'optional':
      walk(d.innerType as z.ZodType, out, skip);
      break;
    case 'array':
      walk(d.element as z.ZodType, out, skip);
      break;
    case 'union':
      for (const option of d.options ?? []) walk(option, out, skip);
      break;
    case 'enum':
      out.values.push(...Object.values(d.entries ?? {}));
      break;
    case 'literal':
      out.values.push(...(d.values ?? []).map(String));
      break;
    default:
      // string, number, boolean: nothing to list
      break;
  }
}

function readSchemas(draftSchema: z.ZodType = SetupDraftSchema) {
  const out = { keys: [] as string[], values: [] as string[] };
  walk(AssistantTurnSchema, out, new Set(['draft']));
  walk(draftSchema, out);
  return out;
}

// What the prompt says: the field names and the quoted values in its "Reply = ... Draft = ..." text, in order.
function readPromptShape(prompt: string) {
  const start = prompt.indexOf('Reply = ');
  const end = prompt.indexOf('Each entry of "said"');
  expect(start, 'the prompt has a Reply = section').toBeGreaterThan(-1);
  expect(end, 'the prompt has a path section after it').toBeGreaterThan(start);
  const text = prompt.slice(start, end);
  const values = [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const unquoted = text.replace(/"[^"]*"/g, '""');
  const keys = [...unquoted.matchAll(/(?:^|[\s{,(])([A-Za-z][A-Za-z0-9]*)\??: /gm)].map((m) => m[1]);
  return { keys, values, text };
}

// ---------------------------------------------------------------------------
// The prompt against the schemas
// ---------------------------------------------------------------------------

describe('the prompt states the exact shape of a reply and a draft', () => {
  it('names the same fields, in the same order, as the schemas', () => {
    const fromPrompt = readPromptShape(SETUP_SYSTEM_PROMPT).keys;
    expect(fromPrompt).toEqual(readSchemas().keys);
    // Two empty lists would be equal too: the schemas have dozens of fields.
    expect(fromPrompt.length).toBeGreaterThan(60);
    expect(fromPrompt).toEqual(expect.arrayContaining(['key', 'title', 'startDate', 'shape', 'items', 'returnWhen', 'said', 'approved']));
  });

  it('allows the same quoted values, in the same order, as the schemas', () => {
    const fromPrompt = readPromptShape(SETUP_SYSTEM_PROMPT).values;
    expect(fromPrompt).toEqual(readSchemas().values);
    expect(fromPrompt.length).toBeGreaterThan(80);
    expect(fromPrompt).toEqual(expect.arrayContaining(['ongoing', 'finite', 'project', 'active', 'parked', 'deadline_task']));
  });

  it('is the text generated from the schemas, word for word', () => {
    expect(SETUP_SYSTEM_PROMPT).toContain(`Reply = ${REPLY_SHAPE_TEXT}`);
    expect(SETUP_SYSTEM_PROMPT).toContain(`Draft = ${DRAFT_SHAPE_TEXT}`);
    expect(REPLY_SHAPE_TEXT).toContain('draft: Draft,');
  });

  it('says every key is required, that nothing is left out or added, and what to write when there is no answer', () => {
    expect(SETUP_SYSTEM_PROMPT).toMatch(/Every key is required: write null \(or an empty list\) for what the person has not answered/);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/never leave a key out, and never add a key of your own/);
  });

  it('carries the hints a type cannot, in plain words', () => {
    expect(DRAFT_SHAPE_TEXT).toContain('date written YYYY-MM-DD');
    expect(DRAFT_SHAPE_TEXT).toContain('clock time written HH:MM on a 24 hour clock');
    expect(DRAFT_SHAPE_TEXT).toContain('weekday number from 1 to 7 where Monday is 1 and Sunday is 7');
    expect(DRAFT_SHAPE_TEXT).toMatch(/name made of a lowercase letter then lowercase letters, digits or underscores/);
    // A list of alternatives is bracketed, so it cannot be read as one alternative being a list.
    expect(DRAFT_SHAPE_TEXT).toContain('sources: list of ({ kind: "manual" } | { kind: "synced", provider: string }) (at most 4)');
    expect(DRAFT_SHAPE_TEXT).toContain('approved: list of ("goals" | "targets" | "planning" | "talk") (at most 4)');
    // Zod's safe-integer ceiling is noise.
    expect(DRAFT_SHAPE_TEXT).not.toContain('9007199254740991');
  });
});

describe('the comparison can fail', () => {
  it('finds a field added to the draft schema that the prompt does not name', () => {
    const extended = z.strictObject({ ...SetupDraftSchema.shape, extra: z.string().nullable() });
    expect(readPromptShape(SETUP_SYSTEM_PROMPT).keys).not.toEqual(readSchemas(extended).keys);
    // And the generator would have written it, which is why the real prompt cannot miss one.
    expect(renderSchema(extended)).toContain('extra: string | null,');
  });

  it('finds a value added to an enum that the prompt does not allow', () => {
    const extended = z.strictObject({ ...SetupDraftSchema.shape, approved: z.array(z.enum(['goals', 'targets', 'planning', 'talk', 'all'])) });
    expect(readPromptShape(SETUP_SYSTEM_PROMPT).values).not.toEqual(readSchemas(extended).values);
  });

  it('fails a prompt that was written by hand and has drifted', () => {
    const drifted = SETUP_SYSTEM_PROMPT.replace('startDate: date written YYYY-MM-DD | null,', 'start: date written YYYY-MM-DD | null,');
    expect(drifted).not.toBe(SETUP_SYSTEM_PROMPT);
    expect(readPromptShape(drifted).keys).not.toEqual(readSchemas().keys);
  });
});

describe('real drafts use only the fields the prompt names', () => {
  const named = new Set(readPromptShape(SETUP_SYSTEM_PROMPT).keys);
  const keysOf = (value: unknown, out: Set<string> = new Set()): Set<string> => {
    if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        out.add(k);
        keysOf(v, out);
      }
    }
    return out;
  };

  it.each(SETUP_CASES.filter((c) => c.expect === 'clean').map((c) => [c.id, c] as const))('%s: every turn', (_id, c) => {
    for (const turn of c.script) {
      const used = [...keysOf(turn)];
      expect(used.filter((k) => !named.has(k)), `fields not in the prompt, turn ${turn.topic}`).toEqual([]);
      expect(AssistantTurnSchema.safeParse(turn).success).toBe(true);
    }
  });

  it('the empty draft the first call sends has exactly the fields the prompt names at its top levels', () => {
    expect(Object.keys(emptyDraft())).toEqual(['model', 'said', 'approved']);
    expect(Object.keys(emptyDraft().model)).toEqual(['person', 'settings', 'goals']);
  });
});

// ---------------------------------------------------------------------------
// Provenance paths
// ---------------------------------------------------------------------------

describe('the provenance path forms in the prompt', () => {
  const regexOf = (form: string) =>
    new RegExp(
      `^${form
        .replace(/[.]/g, '\\.')
        .replace(/<goalKey>|<targetKey>|<itemKey>/g, '[a-z][a-z0-9_]*')
        .replace(/<name>/g, '[^.]+')}$`,
    );
  const formOf = (path: string) => PROVENANCE_PATH_FORMS.find((f) => regexOf(f).test(path));

  // A model with every kind of value that needs a source.
  const maximal = (): SetupModel => {
    const model = emptyDraft().model;
    model.person.dayEnd = '21:00';
    model.person.weekStart = 1;
    model.person.planning = { weekday: 7, time: '18:00' };
    model.person.dayTypes = [{ name: 'Work Day', capacityUnit: 'hours', capacityAmount: 6 }];
    model.goals = [
      goal('g1', 'Goal', {
        startDate: '2026-10-27',
        endDate: '2027-01-01',
        blockWeeks: 10,
        state: 'parked',
        returnWhen: { kind: 'date', date: '2027-03-01' },
        targets: [
          target('t1', 'Weekly', { floor: 3, aspiration: 5, qualifyingThreshold: 10 }),
          target('t2', 'Slots', { period: { kind: 'day_slots', weekdays: [1, 3] } }),
          target('t3', 'Deadline', { period: { kind: 'deadline', dueDate: '2027-02-01' } }),
        ],
        items: [item('i1', 'deadline_task', 'Task', { dueDate: '2027-02-01', dateCanMove: false, estimateMinutes: 90 })],
      }),
    ];
    return model;
  };

  it('are written out in the prompt', () => {
    for (const form of PROVENANCE_PATH_FORMS) expect(SETUP_SYSTEM_PROMPT).toContain(`- ${form}\n`);
    expect(SETUP_SYSTEM_PROMPT).toMatch(/<name> is a day type's name in lowercase/);
  });

  it('cover every path provenanceLeaves() produces, so a new kind of value cannot be added without one', () => {
    const paths = provenanceLeaves(maximal()).map((l) => l.path);
    expect(paths.length).toBeGreaterThanOrEqual(PROVENANCE_PATH_FORMS.length);
    for (const path of paths) expect(formOf(path), path).toBeDefined();
  });

  it('are all used: every form is the form of some path, so none is left over', () => {
    const used = new Set(provenanceLeaves(maximal()).map((l) => formOf(l.path)));
    expect([...PROVENANCE_PATH_FORMS].filter((f) => !used.has(f))).toEqual([]);
  });

  it('match every path in the finished eval drafts, which the validator already accepts', () => {
    for (const c of SETUP_CASES.filter((x) => x.expect === 'clean')) {
      const last = c.script[c.script.length - 1].draft;
      for (const entry of last.said) expect(formOf(entry.path), `${c.id}: ${entry.path}`).toBeDefined();
    }
  });

  it('would fail on a form that is wrong', () => {
    expect(formOf('goals.g1.targets.t1.floors')).toBeUndefined();
    expect(formOf('goal.g1.startDate')).toBeUndefined();
  });
});
