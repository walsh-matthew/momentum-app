// The "this session came from a password reset link" marker (MOM-122). A reset link that is verified by token starts a
// session whose `amr` claim says `otp`, not `recovery`, so the claim alone cannot tell it from any other one-time-code
// session. The reset route therefore also sets this cookie: an expiry and an HMAC over the user id and that expiry,
// made with RECOVERY_COOKIE_SECRET. The new-password page and the password update accept an `otp` session only with a
// marker that is signed, unexpired and for the same user. Pure functions; the cookie is read and set by the callers.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const RECOVERY_COOKIE = 'momentum_recovery';
export const RECOVERY_COOKIE_MAX_AGE_SECONDS = 15 * 60;

export interface RecoveryCookie {
  name: string;
  value: string;
  maxAge: number;
}

function signature(userId: string, expiresAt: number, secret: string): string {
  return createHmac('sha256', secret).update(`${userId}.${expiresAt}`).digest('base64url');
}

// The cookie to set for `userId`: `<expiry in seconds>.<signature>`. The user id is not in the cookie; the checker
// supplies it from the session, so a marker made for one person is worthless in another person's session.
export function recoveryMarkerCookie(userId: string, secret: string, now: Date = new Date()): RecoveryCookie {
  const expiresAt = Math.floor(now.getTime() / 1000) + RECOVERY_COOKIE_MAX_AGE_SECONDS;
  return {
    name: RECOVERY_COOKIE,
    value: `${expiresAt}.${signature(userId, expiresAt, secret)}`,
    maxAge: RECOVERY_COOKIE_MAX_AGE_SECONDS,
  };
}

// True only for a marker that parses, has not expired, and carries the signature for exactly this user and expiry.
export function isValidRecoveryMarker(
  value: string | undefined,
  userId: string,
  secret: string,
  now: Date = new Date(),
): boolean {
  if (!value || !userId) return false;
  const parts = value.split('.');
  if (parts.length !== 2 || !/^\d{1,12}$/.test(parts[0])) return false;
  const expiresAt = Number(parts[0]);
  if (expiresAt <= Math.floor(now.getTime() / 1000)) return false;
  const given = Buffer.from(parts[1]);
  const expected = Buffer.from(signature(userId, expiresAt, secret));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
