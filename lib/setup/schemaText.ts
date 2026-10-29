// Writes the exact shape of a setup reply and draft as text for the setup prompt, from the zod schemas in types/setup.ts
// (MOM-128). The first live run showed why: the prompt described the draft in prose only, and the model, given no field
// names, made up its own for a goal and the reply was rejected. Generating the text from the schemas the validator uses
// means the prompt cannot name a field the validator does not know, or leave one out. Pure.
//
// It reads each schema through zod's own JSON Schema output and writes it as a compact type: one line per key, every key
// required, `| null` where the schema allows null, enums as their quoted values, and the describe() hint of a leaf where
// the schema has one ("date written YYYY-MM-DD"). A named type can stand in for a subtree (the reply names `Draft` instead
// of repeating it).

import { z } from 'zod';

interface JsonNode {
  // Zod writes a nullable leaf either as anyOf with a null branch or as a type list such as ["string", "null"].
  type?: string | string[];
  properties?: Record<string, JsonNode>;
  required?: string[];
  items?: JsonNode;
  anyOf?: JsonNode[];
  oneOf?: JsonNode[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
}

const quote = (v: unknown): string => JSON.stringify(v);

function bounds(n: JsonNode): string {
  // Zod gives every integer the limits of a safe integer; they say nothing the model needs.
  const minimum = n.minimum !== undefined && n.minimum > Number.MIN_SAFE_INTEGER ? n.minimum : undefined;
  const maximum = n.maximum !== undefined && n.maximum < Number.MAX_SAFE_INTEGER ? n.maximum : undefined;
  if (minimum !== undefined && maximum !== undefined) return `${minimum} to ${maximum}`;
  const parts: string[] = [];
  if (minimum !== undefined) parts.push(`at least ${minimum}`);
  if (n.exclusiveMinimum !== undefined) parts.push(`above ${n.exclusiveMinimum}`);
  if (maximum !== undefined) parts.push(`at most ${maximum}`);
  return parts.join(', ');
}

function leaf(n: JsonNode): string {
  if (n.description) return n.description;
  if (n.enum) return n.enum.map(quote).join(' | ');
  if (n.const !== undefined) return quote(n.const);
  if (n.type === 'string') {
    if (n.minLength !== undefined || n.maxLength !== undefined) return `string of ${n.minLength ?? 0} to ${n.maxLength} characters`;
    return 'string';
  }
  if (n.type === 'integer' || n.type === 'number') {
    const b = bounds(n);
    return `${n.type}${b ? ` ${b}` : ''}`;
  }
  if (n.type === 'boolean') return 'boolean';
  throw new Error(`The setup prompt cannot describe a schema node of type "${n.type}".`);
}

// `inline` writes an object on one line, for a union branch.
function render(n: JsonNode, indent: string, inline: boolean): string {
  if (Array.isArray(n.type)) {
    const rest = n.type.filter((t) => t !== 'null');
    if (rest.length !== 1) throw new Error(`The setup prompt cannot describe a schema node of type "${n.type.join(',')}".`);
    const text = render({ ...n, type: rest[0] }, indent, inline);
    return rest.length !== n.type.length ? `${text} | null` : text;
  }
  const branches = n.anyOf ?? n.oneOf;
  if (branches) {
    const nonNull = branches.filter((b) => b.type !== 'null');
    const hasNull = nonNull.length !== branches.length;
    // A hint on the nullable key itself (a source's metric) says more than its values do.
    const text = n.description ?? nonNull.map((b) => render(b, indent, true)).join(' | ');
    return hasNull ? `${text} | null` : text;
  }
  if (n.type === 'array') {
    const items = n.items as JsonNode;
    const item = render(items, indent, inline);
    // `list of A | B` would read as a list of A, or a B; several alternatives go in brackets.
    const several = Boolean(items.anyOf ?? items.oneOf ?? items.enum) || Array.isArray(items.type);
    const limit = n.maxItems !== undefined ? ` (at most ${n.maxItems})` : '';
    return `list of ${several ? `(${item})` : item}${limit}`;
  }
  if (n.type === 'object' && n.properties) {
    const required = new Set(n.required ?? []);
    const entries = Object.entries(n.properties).map(([k, v]) => `${k}${required.has(k) ? '' : '?'}: ${render(v, `${indent}  `, inline)}`);
    if (inline) return `{ ${entries.join(', ')} }`;
    return `{\n${entries.map((e) => `${indent}  ${e},`).join('\n')}\n${indent}}`;
  }
  return leaf(n);
}

// Writes `schema` as a type. `named` replaces the subtree at a top-level key with a name (the reply names `Draft`).
export function renderSchema(schema: z.ZodType, named: Record<string, string> = {}): string {
  const json = z.toJSONSchema(schema) as JsonNode;
  for (const [key, name] of Object.entries(named)) {
    if (!json.properties?.[key]) throw new Error(`No key "${key}" to name.`);
    json.properties[key] = { description: name };
  }
  return render(json, '', false);
}

// The nodes a value at one step of a path could be: an object's key, a list's item, or, inside a union, every branch that
// has that key.
function stepInto(nodes: JsonNode[], step: string | number): JsonNode[] {
  const out: JsonNode[] = [];
  for (const n of nodes) {
    const branches = n.anyOf ?? n.oneOf;
    if (branches) {
      out.push(...stepInto(branches, step));
      continue;
    }
    if (typeof step === 'number' && n.items) out.push(n.items);
    else if (typeof step === 'string' && n.properties?.[step]) out.push(n.properties[step]);
  }
  return out;
}

// What `schema` needs at `path`, written the way the prompt writes it, on one line (MOM-111 round 2, A): the retry of a reply
// that failed the shape is told this, not a general note about the shape. Null when the path is not in the schema.
export function describeAt(schema: z.ZodType, path: readonly (string | number)[]): string | null {
  let nodes: JsonNode[] = [z.toJSONSchema(schema) as JsonNode];
  for (const step of path) {
    nodes = stepInto(nodes, step);
    if (nodes.length === 0) return null;
  }
  const texts = [...new Set(nodes.map((n) => render(n, '', true)))];
  return texts.join(' | ');
}
