// The one or two letters shown on the account avatar, from the signed-in user's email. Pure, so the server and the
// browser render the same text (no hydration mismatch). "ada.lovelace@x.com" is "AL", "matt@x.com" is "MA".

export function initialsFrom(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const words = local.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length >= 2 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}
