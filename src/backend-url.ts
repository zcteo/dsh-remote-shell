/**
 * Backend address parsing shared by the main process and the connect page.
 *
 * The shell accepts an address a person types, not one a configuration file
 * supplies, so this module owns the whole normalization: a bare `host:port`
 * gains a scheme, and every rejected input reports which rule it broke so the
 * page can localize the reason instead of echoing parser text.
 */

/** Why a typed address is not usable as a backend. */
export type BackendUrlRejection =
  /** Empty after trimming. */
  | 'empty'
  /**
   * Not parseable as a URL after a scheme was assumed. `http:` and `https:` are
   * WHATWG special schemes, so an address naming no host (`http://` alone)
   * throws here rather than yielding an empty hostname.
   */
  | 'malformed'
  /** A scheme other than `http:` or `https:`. */
  | 'scheme'
  /** User credentials in the address, which the shell never stores. */
  | 'credentials'

/** One parse outcome; `ok` discriminates the two halves. */
export type BackendUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: BackendUrlRejection }

/** Schemes the shell dials; anything else is a different kind of endpoint. */
const SUPPORTED_SCHEMES = new Set(['http:', 'https:'])

/**
 * Whether text already names a scheme, so the `http://` guess must not apply.
 *
 * A scheme is `scheme:` followed by anything but a digit. Requiring the
 * non-digit is what separates `ftp:example.test` (a scheme) from the bare
 * `localhost:3080` (a host and port, whose colon introduces a number), so
 * neither form is guessed at wrongly. A bracketed IPv6 literal has no colon
 * before its hostname ends and never matches here.
 */
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:(?!\d)/i

/**
 * Normalize one typed backend address.
 *
 * A trailing slash is preserved only as the URL parser emits it: `dsh web`
 * serves the application at the root, and later navigation resolves relative
 * paths against whatever the person typed, so the path component is kept
 * verbatim rather than rewritten.
 * @param input - Text exactly as typed, including any launch token.
 * @returns The normalized absolute URL, or the reason it was refused.
 */
export function parseBackendUrl(input: string): BackendUrlResult {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }
  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `http://${trimmed}`
  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch (_notAUrl) {
    return { ok: false, reason: 'malformed' }
  }
  if (!SUPPORTED_SCHEMES.has(parsed.protocol)) return { ok: false, reason: 'scheme' }
  if (parsed.username !== '' || parsed.password !== '') return { ok: false, reason: 'credentials' }
  return { ok: true, url: parsed.href }
}

/** Query parameter name of the `dsh web` launch token. */
const TOKEN_QUERY = 'token'

/**
 * Strip the launch token from a backend address.
 *
 * The token is a per-process credential: it changes on every `dsh web` start and
 * is only ever useful for the single exchange that mints the signed session
 * cookie. Remembering the address across launches therefore means remembering it
 * without the token — the cookie is what admits the window the second time, and
 * a stored token would be dead on arrival anyway.
 * @param url - A normalized URL, as returned by {@link parseBackendUrl}.
 * @returns The same address with its token parameter removed.
 */
export function withoutLaunchToken(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (_notAUrl) {
    return url
  }
  if (!parsed.searchParams.has(TOKEN_QUERY)) return url
  parsed.searchParams.delete(TOKEN_QUERY)
  return parsed.href
}

/**
 * Read the authority one backend URL names, for display in the window frame.
 * @param url - A normalized URL, as returned by {@link parseBackendUrl}.
 * @returns The `host:port` text, or the input when it does not parse.
 */
export function backendAuthority(url: string): string {
  try {
    return new URL(url).host
  } catch (_notAUrl) {
    return url
  }
}
