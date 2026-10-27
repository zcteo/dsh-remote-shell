/**
 * Render the tray icon from the brand vector source.
 *
 * A tray shows this icon at 16 logical pixels, so the platform picks one of the
 * bundled bitmaps by display scale. Each size is rasterized from the vector
 * separately instead of downscaling one large bitmap, which keeps the edges
 * crisp at every scale. The committed ICO is the output; rerun
 * `pnpm run render:tray-icon` after changing the vector source.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/** Bitmap edge lengths bundled in the tray icon: 16 px at 100 % through 400 % display scale. */
const TRAY_ICON_SIZES = [16, 20, 24, 32, 40, 48, 64] as const

const SOURCE = fileURLToPath(new URL('../resources/icon-windows.svg', import.meta.url))
const ICO_OUTPUT = fileURLToPath(new URL('../resources/tray.ico', import.meta.url))
const PNG_OUTPUT = fileURLToPath(new URL('../resources/tray.png', import.meta.url))

/** Coordinate space of the vector source; sharp's SVG density scales against it. */
const SOURCE_EDGE = 1024
const SOURCE_DENSITY = 72
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ICON_DIRECTORY_BYTES = 6
const ICON_ENTRY_BYTES = 16

/** One bitmap of an icon file. */
interface IcoEntry {
  readonly size: number
  /** Complete PNG stream; the ICO reader accepts PNG-compressed entries. */
  readonly png: Buffer
}

/**
 * Read one PNG stream's declared dimensions.
 * @param png - PNG bytes.
 * @returns The width and height held in the IHDR chunk.
 */
function pngDimensions(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('tray icon: bitmap is not a PNG stream')
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

/**
 * Pack PNG bitmaps into one ICO file.
 * @param entries - Bitmaps in ascending size; each PNG must be square at its declared edge.
 * @returns The ICO bytes.
 */
function packIco(entries: readonly IcoEntry[]): Buffer {
  const header = Buffer.alloc(ICON_DIRECTORY_BYTES + ICON_ENTRY_BYTES * entries.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach((entry, index) => {
    const { width, height } = pngDimensions(entry.png)
    if (width !== entry.size || height !== entry.size) {
      throw new Error(`tray icon: bitmap ${String(index)} is ${String(width)}x${String(height)}, expected ${String(entry.size)}`)
    }
    const at = ICON_DIRECTORY_BYTES + ICON_ENTRY_BYTES * index
    // A 256 px entry is encoded as 0 in the one-byte edge fields.
    header.writeUInt8(entry.size % 256, at)
    header.writeUInt8(entry.size % 256, at + 1)
    header.writeUInt8(0, at + 2)
    header.writeUInt8(0, at + 3)
    header.writeUInt16LE(1, at + 4)
    header.writeUInt16LE(32, at + 6)
    header.writeUInt32LE(entry.png.length, at + 8)
    header.writeUInt32LE(offset, at + 12)
    offset += entry.png.length
  })
  return Buffer.concat([header, ...entries.map(entry => entry.png)])
}

/**
 * Rasterize the vector source at each tray size.
 * @param svg - SVG document carrying the `tray-glyph` group.
 * @param sizes - Bitmap edges to render.
 * @returns PNG entries in the given order.
 */
async function renderEntries(svg: Buffer, sizes: readonly number[]): Promise<IcoEntry[]> {
  const source = svg.toString('utf8')
  const glyph = '<g id="tray-glyph"'
  if (!source.includes(glyph)) throw new Error('tray icon: SVG requires a tray-glyph group')
  // Enlarge the glyph around the tile center, keeping the background and the
  // whale's aspect ratio, because a tray renders it far smaller than a window icon.
  const tray = Buffer.from(source.replace(glyph, `${glyph} transform="translate(552 544) scale(1.2) translate(-552 -544)"`))
  return Promise.all(sizes.map(async size => ({
    size,
    png: await sharp(tray, { density: SOURCE_DENSITY * size / SOURCE_EDGE }).resize(size, size).png().toBuffer(),
  })))
}

const svg = await readFile(SOURCE)
const entries = await renderEntries(svg, TRAY_ICON_SIZES)
await writeFile(ICO_OUTPUT, packIco(entries))
// Linux and macOS take a single bitmap; 64 px covers a 4× tray without a reset.
await writeFile(PNG_OUTPUT, await sharp(svg, { density: SOURCE_DENSITY * 64 / SOURCE_EDGE }).resize(64, 64).png().toBuffer())
console.info(`tray icon: wrote ${ICO_OUTPUT} (${TRAY_ICON_SIZES.join(', ')} px) and ${PNG_OUTPUT}`)
