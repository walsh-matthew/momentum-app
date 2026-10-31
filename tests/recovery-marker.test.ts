// @vitest-environment node
// The signed "this session came from a reset link" marker (MOM-122, lib/services/recoveryMarker.ts): a marker made
// for a user, with a secret, before it expires is valid; a forged, tampered, expired, other-user, malformed or
// wrong-secret one is refused.

import { describe, expect, it } from 'vitest';
import {
  RECOVERY_COOKIE,
  RECOVERY_COOKIE_MAX_AGE_SECONDS,
  isValidRecoveryMarker,
  recoveryMarkerCookie,
} from '@/lib/services/recoveryMarker';

const SECRET = 'test-secret-test-secret-test-secret-0001';
const OTHER_SECRET = 'test-secret-test-secret-test-secret-0002';
const NOW = new Date('2026-10-30T12:00:00Z');
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

describe('the recovery marker cookie', () => {
  it('lasts 15 minutes and is named for what it is', () => {
    const cookie = recoveryMarkerCookie('user-a', SECRET, NOW);
    expect(cookie.name).toBe(RECOVERY_COOKIE);
    expect(cookie.maxAge).toBe(15 * 60);
    expect(RECOVERY_COOKIE_MAX_AGE_SECONDS).toBe(900);
  });

  it('does not contain the user id or the secret', () => {
    const { value } = recoveryMarkerCookie('user-a', SECRET, NOW);
    expect(value).not.toContain('user-a');
    expect(value).not.toContain(SECRET);
  });

  it('is valid for the same user, with the same secret, before it expires', () => {
    const { value } = recoveryMarkerCookie('user-a', SECRET, NOW);
    expect(isValidRecoveryMarker(value, 'user-a', SECRET, NOW)).toBe(true);
    expect(isValidRecoveryMarker(value, 'user-a', SECRET, later(14 * 60 + 59))).toBe(true);
  });

  it('is refused once expired', () => {
    const { value } = recoveryMarkerCookie('user-a', SECRET, NOW);
    expect(isValidRecoveryMarker(value, 'user-a', SECRET, later(15 * 60))).toBe(false);
    expect(isValidRecoveryMarker(value, 'user-a', SECRET, later(3600))).toBe(false);
  });

  it("is refused in another user's session", () => {
    const { value } = recoveryMarkerCookie('user-a', SECRET, NOW);
    expect(isValidRecoveryMarker(value, 'user-b', SECRET, NOW)).toBe(false);
    expect(isValidRecoveryMarker(value, '', SECRET, NOW)).toBe(false);
  });

  it('is refused when signed with a different secret', () => {
    const { value } = recoveryMarkerCookie('user-a', OTHER_SECRET, NOW);
    expect(isValidRecoveryMarker(value, 'user-a', SECRET, NOW)).toBe(false);
  });

  it('is refused when forged or tampered with', () => {
    const { value } = recoveryMarkerCookie('user-a', SECRET, NOW);
    const [expiry, signature] = value.split('.');
    const farFuture = String(Number(expiry) + 10 * 365 * 24 * 3600);
    const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    const forged = [
      `${farFuture}.${signature}`, // the expiry stretched, signature kept
      `${expiry}.${flipped}`, // one character of the signature changed
      `${expiry}.`, // empty signature
      `${expiry}.${signature}.extra`, // too many parts
      `${expiry}`, // no signature
      `abc.${signature}`, // non-numeric expiry
      `-${expiry}.${signature}`, // signed expiry
      `${farFuture}.forged`, // plain guess
      '',
    ];
    for (const attempt of forged) {
      expect(isValidRecoveryMarker(attempt, 'user-a', SECRET, NOW), attempt).toBe(false);
    }
    expect(isValidRecoveryMarker(undefined, 'user-a', SECRET, NOW)).toBe(false);
  });
});
