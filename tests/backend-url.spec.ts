import { describe, expect, it } from 'vitest'
import { backendAuthority, parseBackendUrl, withoutLaunchToken } from '../src/backend-url.ts'

describe('parseBackendUrl', () => {
  it('assumes http for a bare authority', () => {
    expect(parseBackendUrl('127.0.0.1:3080')).toEqual({ ok: true, url: 'http://127.0.0.1:3080/' })
  })

  it('keeps an explicit https scheme', () => {
    expect(parseBackendUrl('https://harness.example/')).toEqual({ ok: true, url: 'https://harness.example/' })
  })

  it('trims surrounding whitespace before parsing', () => {
    expect(parseBackendUrl('  localhost:3080  ')).toEqual({ ok: true, url: 'http://localhost:3080/' })
  })

  it('preserves the launch token query string', () => {
    expect(parseBackendUrl('http://127.0.0.1:3080/?token=abc123'))
      .toEqual({ ok: true, url: 'http://127.0.0.1:3080/?token=abc123' })
  })

  it('preserves a path prefix a reverse proxy serves under', () => {
    expect(parseBackendUrl('https://example.test/harness/?token=t')).toEqual({
      ok: true,
      url: 'https://example.test/harness/?token=t',
    })
  })

  it('preserves an IPv6 literal host', () => {
    expect(parseBackendUrl('[::1]:3080')).toEqual({ ok: true, url: 'http://[::1]:3080/' })
  })

  it('rejects empty input', () => {
    expect(parseBackendUrl('')).toEqual({ ok: false, reason: 'empty' })
    expect(parseBackendUrl('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects a scheme other than http or https', () => {
    expect(parseBackendUrl('ftp://example.test')).toEqual({ ok: false, reason: 'scheme' })
    expect(parseBackendUrl('file:///etc/passwd')).toEqual({ ok: false, reason: 'scheme' })
  })

  it('rejects a scheme written without the authority separator', () => {
    // `ftp:example.test` names no authority, so it must not be read as a bare
    // `host:port` and silently become `http://ftp:example.test`.
    expect(parseBackendUrl('ftp:example.test')).toEqual({ ok: false, reason: 'scheme' })
  })

  it('rejects text that names no host', () => {
    // `http:` and `https:` are WHATWG special schemes, so an authority-less
    // address throws rather than parsing to an empty hostname.
    expect(parseBackendUrl('http://')).toEqual({ ok: false, reason: 'malformed' })
    expect(parseBackendUrl('https://')).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects text that is not a URL at all', () => {
    expect(parseBackendUrl('not a url')).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects embedded credentials', () => {
    expect(parseBackendUrl('http://user:secret@127.0.0.1:3080'))
      .toEqual({ ok: false, reason: 'credentials' })
  })
})

describe('withoutLaunchToken', () => {
  it('removes the launch token a connection was made with', () => {
    expect(withoutLaunchToken('http://127.0.0.1:3080/?token=abc123')).toBe('http://127.0.0.1:3080/')
  })

  it('removes the token from an address that also carries a path', () => {
    expect(withoutLaunchToken('https://example.test/harness/?token=t&keep=1'))
      .toBe('https://example.test/harness/?keep=1')
  })

  it('leaves an address without a token unchanged', () => {
    expect(withoutLaunchToken('http://127.0.0.1:3080/')).toBe('http://127.0.0.1:3080/')
  })

  it('returns unparseable input unchanged', () => {
    expect(withoutLaunchToken('not a url')).toBe('not a url')
  })

  it('round-trips a parsed address so the remembered value reconnects', () => {
    const parsed = parseBackendUrl('127.0.0.1:3080/?token=zzz')
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const remembered = withoutLaunchToken(parsed.url)
    expect(remembered).toBe('http://127.0.0.1:3080/')
    // The stored value must itself be a usable backend address on the next launch.
    expect(parseBackendUrl(remembered)).toEqual({ ok: true, url: remembered })
  })
})

describe('backendAuthority', () => {
  it('reads the host and port of a normalized URL', () => {
    expect(backendAuthority('http://127.0.0.1:3080/')).toBe('127.0.0.1:3080')
  })

  it('returns the input when it does not parse', () => {
    expect(backendAuthority('not a url')).toBe('not a url')
  })
})
