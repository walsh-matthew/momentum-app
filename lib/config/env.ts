// Single, validated entry point for runtime environment variables (MOM-28).
// Server code reads env through getPublicEnv() / getServerEnv() instead of touching process.env.
//
// `server-only` makes the build fail if a Client Component ever imports this module, which keeps
// the server secrets below out of browser bundles. Validation is lazy (on first call), so
// `next build` does not need runtime secrets present. See .env.example for every variable.

import 'server-only';
import { z } from 'zod';

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

// Never give these a NEXT_PUBLIC_ prefix: Next.js would inline them into the browser bundle.
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  HEVY_API_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

// Reports variable names and rules only, never values, so secrets cannot leak into logs.
function parseEnv<T extends z.ZodType>(schema: T, source: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid ${label} environment variables. See .env.example.\n  ${problems.join('\n  ')}`);
}

let publicEnv: PublicEnv | undefined;
let serverEnv: ServerEnv | undefined;

export function getPublicEnv(): PublicEnv {
  // Each NEXT_PUBLIC_ name is written out in full; Next.js only inlines static references.
  publicEnv ??= parseEnv(
    publicSchema,
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    'public',
  );
  return publicEnv;
}

export function getServerEnv(): ServerEnv {
  serverEnv ??= parseEnv(
    serverSchema,
    {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      HEVY_API_KEY: process.env.HEVY_API_KEY,
    },
    'server',
  );
  return serverEnv;
}
