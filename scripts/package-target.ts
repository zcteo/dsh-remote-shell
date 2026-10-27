/**
 * Build the remote shell's installers for one target.
 *
 * The script is the reproducible entry point: it builds the application, then
 * runs electron-builder against the configuration of the requested target and
 * prints where the artifacts landed. Nothing is compiled natively here, so one
 * Linux host produces both the Linux and the Windows artifact from the same
 * command.
 *
 * A Windows installer additionally needs Wine, because electron-builder runs the
 * generated installer under it when packaging off Windows. When Wine is absent the
 * script still produces the complete unpacked Windows application and archives it
 * as a zip, and says which artifact it produced, so a host without Wine yields a
 * usable distribution instead of a bare failure.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { zipSync, type Zippable } from 'fflate'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const LIB_ENTRY = resolve(APP_ROOT, 'lib', 'main.js')
const CONNECT_ENTRY = resolve(APP_ROOT, 'lib', 'connect', 'connect.html')

/** Builder selectors of one supported target. */
interface Target {
  /** electron-builder `--<platform>` selector. */
  readonly platform: 'linux' | 'win'
  /** electron-builder `--<arch>` selector. */
  readonly arch: 'x64'
}

/** Every target this application can be packaged for, keyed by its directory name. */
const TARGETS: Readonly<Record<string, Target>> = {
  'linux-x64': { platform: 'linux', arch: 'x64' },
  'win-x64': { platform: 'win', arch: 'x64' },
}

/** One resolved target and the name its artifacts are filed under. */
interface ResolvedTarget extends Target {
  /** Target name, also the `dist/` subdirectory. */
  readonly name: string
}

/**
 * Resolve the target to build.
 * @param name - Target name from the command line, or undefined for the host's own.
 * @returns The resolved target.
 * @throws When the name is unknown or the host has no supported target.
 */
function resolveTarget(name: string | undefined): ResolvedTarget {
  if (name !== undefined) {
    const target = TARGETS[name]
    if (target === undefined) {
      throw new Error(`package-target: unknown target ${name}; expected one of ${Object.keys(TARGETS).join(', ')}`)
    }
    return { name, ...target }
  }
  const platform = process.platform === 'win32' ? 'win' : process.platform
  const derived = `${platform}-${process.arch}`
  const target = TARGETS[derived]
  if (target === undefined) {
    throw new Error(`package-target: unsupported host ${derived}; name one of ${Object.keys(TARGETS).join(', ')}`)
  }
  return { name: derived, ...target }
}

/**
 * Build the application, or verify the existing output is complete.
 *
 * Packaging an absent or stale `lib/` would produce an installer whose window
 * cannot resolve its own page, so the output is checked either way.
 * @param build - Whether to run the application build first.
 * @throws When the build fails or the expected entries are missing.
 */
function prepareApplication(build: boolean): void {
  if (build) {
    const built = spawnSync('pnpm', ['run', 'build'], { cwd: APP_ROOT, stdio: 'inherit' })
    if (built.error !== undefined) throw built.error
    if (built.status !== 0) throw new Error(`package-target: application build exited with ${String(built.status)}`)
  }
  for (const entry of [LIB_ENTRY, CONNECT_ENTRY]) {
    if (existsSync(entry)) continue
    throw new Error(`package-target: ${entry} is missing; run \`pnpm run build\` or omit --skip-build`)
  }
}

/**
 * Whether Wine is runnable here.
 *
 * Building a Windows installer off Windows runs the generated installer under
 * Wine for its final resource pass; without Wine that step cannot complete.
 * @returns True when a `wine` executable answers on PATH.
 */
function wineAvailable(): boolean {
  if (process.platform === 'win32') return true
  return spawnSync('wine', ['--version'], { stdio: 'ignore' }).status === 0
}

/** Options controlling one packaging run. */
interface PackageOptions {
  /** Emit only the unpacked application directory. */
  readonly dir: boolean
  /** Keep the previous output instead of replacing it. */
  readonly keepOutput: boolean
}

/**
 * Run electron-builder for one target.
 * @param target - Resolved target.
 * @param dirOnly - Emit only the unpacked application directory.
 * @returns True when electron-builder exited successfully.
 */
function runBuilder(target: ResolvedTarget, dirOnly: boolean): boolean {
  const cli = resolve(APP_ROOT, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
  const output = resolve(APP_ROOT, 'dist', target.name)
  const env: NodeJS.ProcessEnv = { ...process.env }
  // electron-builder downloads its Electron distribution through @electron/get,
  // which honours a proxy only when told to; keep it aligned with the shell's
  // own proxy variable so a restricted network packages the same way it installs.
  if (env.https_proxy !== undefined || env.HTTPS_PROXY !== undefined) env.ELECTRON_GET_USE_PROXY = '1'
  const args = [
    cli,
    '--config',
    resolve(APP_ROOT, 'electron-builder.config.mjs'),
    `--${target.platform}`,
    `--${target.arch}`,
    // One configuration serves every target, so the per-target output directory
    // is chosen here: artifacts for one platform never overwrite another's.
    `--config.directories.output=${output}`,
    ...(dirOnly ? ['--dir'] : []),
  ]
  const result = spawnSync(process.execPath, args, { cwd: APP_ROOT, stdio: 'inherit', env })
  if (result.error !== undefined) throw result.error
  return result.status === 0
}

/**
 * Collect one directory tree into the archive shape fflate expects.
 *
 * The Windows payload is roughly a gigabyte of Chromium resources, and the
 * executable bits that matter to a zip consumer are not preserved anyway, so the
 * entries are stored deflated and nested by their path relative to the root.
 * @param root - Directory to archive.
 * @param directory - Directory being visited, seeded with the root.
 * @param into - Archive accumulating entries.
 * @returns The archive, for chaining.
 */
function collectTree(root: string, directory: string, into: Zippable): Zippable {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    const relativePath = relative(root, absolute).split('\\').join('/')
    if (entry.isDirectory()) {
      collectTree(root, absolute, into)
      continue
    }
    if (!entry.isFile()) continue
    into[relativePath] = new Uint8Array(readFileSync(absolute))
  }
  return into
}

/**
 * Archive one unpacked application directory for distribution.
 * @param directory - Directory holding the complete unpacked application.
 * @param archive - Absolute path of the zip to write.
 * @returns The archive path.
 */
function archiveDirectory(directory: string, archive: string): string {
  const tree = collectTree(directory, directory, {})
  const packed = zipSync(tree, { level: 6 })
  writeFileSync(archive, packed)
  const megabytes = (statSync(archive).size / 1024 / 1024).toFixed(1)
  return `${archive} (${megabytes} MiB)`
}

/** Report the files one packaging run produced. */
function report(output: string, target: ResolvedTarget): void {
  console.log(`package-target: ${target.name} artifacts in ${output}`)
  for (const name of existsSync(output) ? readdirSync(output).sort() : []) console.log(`  ${name}`)
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    dir: { type: 'boolean', default: false },
    'skip-build': { type: 'boolean', default: false },
    'keep-output': { type: 'boolean', default: false },
  },
  allowPositionals: true,
})

if (positionals.length > 1) throw new Error(`package-target: expected at most one target, got ${positionals.join(' ')}`)
const target = resolveTarget(positionals[0])
prepareApplication(values['skip-build'] !== true)

const output = resolve(APP_ROOT, 'dist', target.name)
const options: PackageOptions = { dir: values.dir === true, keepOutput: values['keep-output'] === true }
if (!options.keepOutput) rmSync(output, { recursive: true, force: true })

/**
 * Archive the unpacked Windows application beside the installer.
 *
 * A zip is the artifact for anyone who wants the application without an
 * installation step: run it from the extracted folder, keep it on a share, or
 * unpack it on a machine where running an installer is inconvenient. It is also
 * the only Windows artifact a host without Wine can produce, because
 * electron-builder needs Wine to finish the installer's resource pass.
 * @param output - Target output directory holding `win-unpacked`.
 * @param arch - Target architecture, part of the archive name.
 * @returns The archive path and size, for the run report.
 * @throws When the unpacked directory the archive must contain is absent.
 */
function archiveWindowsPayload(output: string, arch: string): string {
  const unpacked = resolve(output, 'win-unpacked')
  if (!existsSync(unpacked)) throw new Error(`package-target: ${unpacked} is missing`)
  const version = (JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as { version: string }).version
  return archiveDirectory(unpacked, resolve(output, `dsh-remote-shell-${version}-win-${arch}.zip`))
}

// Windows installers need Wine off Windows. Without it, build the application
// directory and archive it instead of leaving the run failed with no
// distributable artifact; with it, the installer is built and the archive is
// produced from the payload beside it.
if (target.platform === 'win' && !wineAvailable()) {
  console.warn('package-target: wine is unavailable, so the NSIS installer cannot be built here;')
  console.warn('package-target: producing the complete unpacked application and archiving it instead.')
  if (!runBuilder(target, true)) throw new Error('package-target: electron-builder --dir exited unsuccessfully')
  console.log(`package-target: portable archive ${archiveWindowsPayload(output, target.arch)}`)
  report(output, target)
  process.exit(0)
}

if (!runBuilder(target, options.dir)) {
  throw new Error('package-target: electron-builder exited unsuccessfully')
}
// `--dir` emits no installer, and a Linux target has no zip form to add.
if (target.platform === 'win' && !options.dir) {
  // The payload directory precedes every target electron-builder builds, so the
  // archive is a read of the same bytes the installer was assembled from. A
  // failure here is reported rather than thrown: the installer is the primary
  // artifact, and losing it because the convenience archive could not be
  // written would be the worse outcome.
  try {
    console.log(`package-target: portable archive ${archiveWindowsPayload(output, target.arch)}`)
  } catch (error) {
    console.warn(`package-target: the portable archive could not be written: ${error instanceof Error ? error.message : String(error)}`)
  }
}
report(output, target)
