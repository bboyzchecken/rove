/**
 * Where sign-in is allowed to send someone afterwards.
 *
 * `?next=` arrives from the URL bar, so it is attacker-controlled: without this
 * check an open redirect would let a link that looks like ROVE's own login drop
 * the user on someone else's page still holding a fresh session.
 *
 * Only a path on this site survives. `//evil.com` is rejected too — the browser
 * reads a protocol-relative URL as another origin even though it starts with a
 * slash.
 */
export const DEFAULT_AFTER_LOGIN = '/home';

export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_LOGIN;
  if (!raw.startsWith('/')) return DEFAULT_AFTER_LOGIN;
  if (raw.startsWith('//')) return DEFAULT_AFTER_LOGIN;
  // A backslash is normalised to a slash by some browsers, so "/\evil.com"
  // would escape the site the same way "//evil.com" does.
  if (raw.startsWith('/\\')) return DEFAULT_AFTER_LOGIN;
  return raw;
}
