/**
 * The remembered backend address on disk.
 *
 * One small JSON file in the application's user-data directory. A missing file
 * means no backend was ever confirmed, an unreadable one is reported and
 * treated the same way, and a write is atomic enough for this purpose: the file
 * is small, replaced through a rename, and only ever read back by this shell.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** Format version of the stored record; a future reader refuses other values. */
const RECORD_VERSION = 1

/** What the shell remembers between launches. */
export interface StoredBackend {
  /** Normalized absolute URL of the dsh web deployment. */
  readonly url: string
}

/** One read outcome: a remembered backend, none yet, or an unusable file. */
export type StoredBackendRead =
  | { readonly kind: 'stored'; readonly backend: StoredBackend }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unreadable'; readonly detail: string }

/**
 * Read the remembered backend.
 * @param path - Absolute path of the settings file.
 * @returns The stored backend, or why there is none.
 */
export function readStoredBackend(path: string): StoredBackendRead {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'absent' }
    return { kind: 'unreadable', detail: error instanceof Error ? error.message : String(error) }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (_invalidJson) {
    return { kind: 'unreadable', detail: 'the settings file is not valid JSON' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'unreadable', detail: 'the settings file is not a JSON object' }
  }
  const record = parsed as { version?: unknown; url?: unknown }
  if (record.version !== RECORD_VERSION) {
    return { kind: 'unreadable', detail: `unsupported settings version ${String(record.version)}` }
  }
  if (typeof record.url !== 'string' || record.url === '') {
    return { kind: 'unreadable', detail: 'the settings file has no backend URL' }
  }
  return { kind: 'stored', backend: { url: record.url } }
}

/**
 * Replace the remembered backend.
 *
 * The record is written beside its destination and renamed into place, so an
 * interrupted write leaves the previous address readable rather than a partial
 * file, and no launch starts against half-written JSON.
 * @param path - Absolute path of the settings file.
 * @param backend - Backend to remember.
 */
export function writeStoredBackend(path: string, backend: StoredBackend): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ version: RECORD_VERSION, url: backend.url }, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
}

/**
 * Forget the remembered backend.
 * @param path - Absolute path of the settings file.
 */
export function clearStoredBackend(path: string): void {
  rmSync(path, { force: true })
}
