// Single, validated entry point for runtime environment variables (MOM-28).
// Server code reads env through getPublicEnv() / getServerEnv() instead of touching process.env.
//
// `server-only` makes the build fail if a Client Component ever imports this module, which keeps
// the server secrets below out of browser bundles. Validation is lazy (on first call), so
// `next build` does not need runtime secrets present. See .env.example for every variable.

import 'server-only';
import { z } from 'zod';
import type { CaptchaConfig } from '@/types/auth';

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

// Narrower than serverSchema on purpose: code that needs one secret should not fail because an
// unrelated one is missing in this environment.
const serviceRoleSchema = serverSchema.pick({ SUPABASE_SERVICE_ROLE_KEY: true });
const anthropicSchema = serverSchema.pick({ ANTHROPIC_API_KEY: true });

// OAuth client credentials for Google Calendar (MOM-37). Server only, like the keys above.
const googleOAuthSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

// The CAPTCHA widget's public site key (MOM-64). Optional on purpose: with no key, no widget is shown and the
// auth calls carry no token, so local development, the browser tests and any deployment that has not switched
// CAPTCHA on behave as before. Both values are public by design; the secret lives only in the Supabase dashboard.
const CAPTCHA_PROVIDERS = ['turnstile', 'hcaptcha'] as const;
const captchaSchema = z.object({
  NEXT_PUBLIC_CAPTCHA_SITE_KEY: z.string().trim().min(1),
  NEXT_PUBLIC_CAPTCHA_PROVIDER: z.enum(CAPTCHA_PROVIDERS).default('turnstile'),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type GoogleOAuthEnv = z.infer<typeof googleOAuthSchema>;

// Reports variable names and rules only, never values, so secrets cannot leak into logs.
function parseEnv<T extends z.ZodType>(schema: T, source: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid ${label} environment variables. See .env.example.\n  ${problems.join('\n  ')}`);
}

let publicEnv: PublicEnv | undefined;
let serverEnv: ServerEnv | undefined;
let serviceRoleKey: string | undefined;
let anthropicApiKey: string | undefined;
let googleOAuthEnv: GoogleOAuthEnv | undefined;

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

// The CAPTCHA to show on sign-up and sign-in, or null when no site key is set. An unset or empty provider means
// Turnstile; a provider that is set but unknown throws, so a typo cannot silently switch the check off.
export function getCaptchaConfig(): CaptchaConfig | null {
  const siteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY?.trim();
  if (!siteKey) return null;
  const parsed = parseEnv(
    captchaSchema,
    {
      NEXT_PUBLIC_CAPTCHA_SITE_KEY: siteKey,
      NEXT_PUBLIC_CAPTCHA_PROVIDER: process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER?.trim() || undefined,
    },
    'CAPTCHA',
  );
  return { provider: parsed.NEXT_PUBLIC_CAPTCHA_PROVIDER, siteKey: parsed.NEXT_PUBLIC_CAPTCHA_SITE_KEY };
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

// Just the service role key, for the admin client (lib/supabase/admin.ts).
export function getSupabaseServiceRoleKey(): string {
  serviceRoleKey ??= parseEnv(
    serviceRoleSchema,
    { SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY },
    'server',
  ).SUPABASE_SERVICE_ROLE_KEY;
  return serviceRoleKey;
}

export function getGoogleOAuthEnv(): GoogleOAuthEnv {
  googleOAuthEnv ??= parseEnv(
    googleOAuthSchema,
    {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    },
    'Google OAuth',
  );
  return googleOAuthEnv;
}

// The key that signs the short-lived cookie saying "this session was started by a password reset link" (MOM-122,
// lib/services/recoveryMarker.ts). Server only. Fails closed: a missing or short value comes back as null, never an
// exception and never a default, so without it the reset link is refused instead of weakly protected. Not cached, so a
// change of environment takes effect on the next request.
export const RECOVERY_SECRET_MIN_LENGTH = 32;

export function getRecoveryCookieSecret(): string | null {
  const secret = process.env.RECOVERY_COOKIE_SECRET?.trim();
  return secret && secret.length >= RECOVERY_SECRET_MIN_LENGTH ? secret : null;
}

// Just the Anthropic key, for the rebalance model call (lib/ai/rebalance.ts, MOM-47). Read only on the
// server, and only when a user asks for a model suggestion.
export function getAnthropicApiKey(): string {
  anthropicApiKey ??= parseEnv(
    anthropicSchema,
    { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY },
    'server',
  ).ANTHROPIC_API_KEY;
  return anthropicApiKey;
}

// What decides whether the browser tests' stand-in for Hevy may be used (lib/services/hevySyncDeps.ts, MOM-129).
// Raw values, not validated: the guard treats anything but the exact expected value as "no". Not secrets.
export interface FakeHevyEnv {
  E2E_FAKE_HEVY: string | undefined;
  NODE_ENV: string | undefined;
  NEXT_PUBLIC_SUPABASE_URL: string | undefined;
}

export function getFakeHevyEnv(): FakeHevyEnv {
  return {
    E2E_FAKE_HEVY: process.env.E2E_FAKE_HEVY,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}
