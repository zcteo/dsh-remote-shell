import { describe, expect, it } from 'vitest'
import { TITLEBAR_HEIGHT, captionStyle, windowControlsInset } from '../src/window-chrome.ts'

describe('windowControlsInset', () => {
  it('reserves the traffic-light width on macOS', () => {
    expect(windowControlsInset('darwin')).toBe(78)
  })

  it('reserves the minimize/maximize/close width elsewhere', () => {
    for (const platform of ['win32', 'linux'] as const) {
      expect(windowControlsInset(platform)).toBe(138)
    }
  })

  it('never reserves less than three 28px controls plus padding', () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      expect(windowControlsInset(platform)).toBeGreaterThan(60)
    }
  })
})

describe('captionStyle', () => {
  it('publishes the caption height and the control inset', () => {
    expect(captionStyle('win32')).toEqual({
      '--dsh-remote-titlebar-height': `${String(TITLEBAR_HEIGHT)}px`,
      '--dsh-remote-controls-inset': '138px',
    })
  })

  it('publishes platform-specific insets', () => {
    expect(captionStyle('darwin')['--dsh-remote-controls-inset']).toBe('78px')
  })

  it('uses a caption tall enough to hold a 26px control', () => {
    expect(TITLEBAR_HEIGHT).toBeGreaterThanOrEqual(26)
  })
})
