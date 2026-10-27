import { describe, expect, it } from 'vitest'
import { copyFor, rejectionMessage } from '../src/locale.ts'

describe('copyFor', () => {
  it('selects Chinese for every zh tag', () => {
    for (const tag of ['zh', 'zh-CN', 'zh-Hans-CN', 'ZH_TW']) {
      expect(copyFor(tag).connectAction).toBe('连接')
    }
  })

  it('falls back to English for other locales', () => {
    for (const tag of ['en-US', 'ja-JP', '', 'fr']) {
      expect(copyFor(tag).connectAction).toBe('Connect')
    }
  })
})

describe('copy dictionaries', () => {
  it('carry the same keys in both locales', () => {
    expect(Object.keys(copyFor('zh-CN')).sort()).toEqual(Object.keys(copyFor('en-US')).sort())
  })

  it('carry no empty sentence', () => {
    for (const locale of ['en-US', 'zh-CN']) {
      // Spread first: the dictionary interface has no string index signature,
      // and the key walk below needs one to enumerate every entry.
      const copy: Readonly<Record<string, string>> = { ...copyFor(locale) }
      for (const [key, value] of Object.entries(copy)) {
        expect(value.length, key).toBeGreaterThan(0)
      }
    }
  })
})

describe('rejectionMessage', () => {
  const copy = copyFor('en-US')

  it('maps each parser rejection onto its own sentence', () => {
    const reasons = ['empty', 'malformed', 'scheme', 'credentials'] as const
    const sentences = new Set<string>()
    for (const reason of reasons) {
      const sentence = rejectionMessage(copy, reason)
      expect(sentence.length).toBeGreaterThan(0)
      sentences.add(sentence)
    }
    expect(sentences.size).toBe(reasons.length)
  })
})
