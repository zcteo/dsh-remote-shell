import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clearStoredBackend, readStoredBackend, writeStoredBackend } from '../src/backend-store.ts'

/** Directories this spec created, removed after each case. */
const created: string[] = []

/**
 * Create one owned temporary directory holding a settings file path.
 * @returns Absolute path of the not-yet-written settings file.
 */
function settingsFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'remote-shell-store-'))
  created.push(directory)
  return join(directory, 'nested', 'backend.json')
}

afterEach(() => {
  for (const directory of created.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('readStoredBackend', () => {
  it('reports absent when nothing was ever stored', () => {
    expect(readStoredBackend(settingsFile())).toEqual({ kind: 'absent' })
  })

  it('reads back what was written, creating the directory', () => {
    const path = settingsFile()
    writeStoredBackend(path, { url: 'http://127.0.0.1:3080/' })
    expect(readStoredBackend(path)).toEqual({ kind: 'stored', backend: { url: 'http://127.0.0.1:3080/' } })
  })

  it('leaves no temporary file behind', () => {
    const path = settingsFile()
    writeStoredBackend(path, { url: 'http://127.0.0.1:3080/' })
    expect(readdirSync(join(path, '..'))).toEqual(['backend.json'])
  })

  it('reports unreadable JSON', () => {
    const path = settingsFile()
    writeStoredBackend(path, { url: 'http://127.0.0.1:3080/' })
    writeFileSync(path, '{ not json', 'utf8')
    expect(readStoredBackend(path).kind).toBe('unreadable')
  })

  it('rejects a value that is not an object', () => {
    const path = settingsFile()
    writeStoredBackend(path, { url: 'http://127.0.0.1:3080/' })
    writeFileSync(path, '[1,2,3]', 'utf8')
    expect(readStoredBackend(path)).toEqual({ kind: 'unreadable', detail: 'the settings file is not a JSON object' })
  })

  it('rejects an unsupported version', () => {
    const path = settingsFile()
    writeStoredBackend(path, { url: 'http://127.0.0.1:3080/' })
    writeFileSync(path, JSON.stringify({ version: 99, url: 'http://127.0.0.1:3080/' }), 'utf8')
    expect(readStoredBackend(path).kind).toBe('unreadable')
  })

  it('rejects a record with no URL', () => {
    const path = settingsFile()
    writeStoredBackend(path, { url: 'http://127.0.0.1:3080/' })
    writeFileSync(path, JSON.stringify({ version: 1 }), 'utf8')
    expect(readStoredBackend(path)).toEqual({ kind: 'unreadable', detail: 'the settings file has no backend URL' })
  })

  it('writes a versioned record', () => {
    const path = settingsFile()
    writeStoredBackend(path, { url: 'http://127.0.0.1:3080/' })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ version: 1, url: 'http://127.0.0.1:3080/' })
  })
})

describe('clearStoredBackend', () => {
  it('removes a stored address so the next read reports absent', () => {
    const path = settingsFile()
    writeStoredBackend(path, { url: 'http://127.0.0.1:3080/' })
    clearStoredBackend(path)
    expect(readStoredBackend(path)).toEqual({ kind: 'absent' })
  })

  it('is a no-op when nothing is stored', () => {
    expect(() => { clearStoredBackend(settingsFile()) }).not.toThrow()
  })
})
