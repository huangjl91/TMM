/**
 * 从 resources/icon/source.jpg 生成全套应用图标。
 * 改图后重跑 `npm run icons` 即可，产物都提交进仓库，构建时不需要 sharp。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'resources', 'icon', 'source.jpg')
const OUT = join(ROOT, 'resources', 'icon')
/** 渲染层的 favicon 走 Vite publicDir，跟窗口图标同源但用途不同，所以单独落一份 */
const FAVICON = join(ROOT, 'src', 'renderer', 'public', 'icon.png')
const SIZES = [16, 24, 32, 48, 64, 128, 256]

if (!existsSync(SRC)) {
  console.error(`找不到源图：${SRC}`)
  process.exit(1)
}

const meta = await sharp(SRC).metadata()
const side = Math.min(meta.width ?? 1024, meta.height ?? 1024)

function mask(size) {
  const r = Math.round(size * 0.18)
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`
  )
}

/**
 * 源图是米色底的正方形，整幅缩到 16px 时细网格线会糊成一片，
 * 所以小尺寸先裁掉外圈留白让主体占满，再补一次锐化。
 */
async function png(size) {
  const crop = size <= 32 ? Math.round(side * 0.8) : side
  return sharp(SRC)
    .extract({
      left: Math.round(((meta.width ?? side) - crop) / 2),
      top: Math.round(((meta.height ?? side) - crop) / 2),
      width: crop,
      height: crop
    })
    .resize(size, size, { fit: 'cover' })
    .sharpen(size <= 64 ? 1.2 : 0.5)
    .png()
    .composite([{ input: mask(size), blend: 'dest-in' }])
    .toBuffer()
}

/** Windows 的 .ico 可以直接装 PNG 负载（Vista+），省掉 BMP 编码 */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = header.length
  images.forEach((img, i) => {
    const e = 6 + i * 16
    header.writeUInt8(img.size >= 256 ? 0 : img.size, e)
    header.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1)
    header.writeUInt8(0, e + 2)
    header.writeUInt8(0, e + 3)
    header.writeUInt16LE(1, e + 4)
    header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(img.data.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += img.data.length
  })
  return Buffer.concat([header, ...images.map((img) => img.data)])
}

mkdirSync(OUT, { recursive: true })
mkdirSync(dirname(FAVICON), { recursive: true })

const bySize = new Map()
for (const size of SIZES) bySize.set(size, await png(size))

writeFileSync(join(OUT, 'icon.ico'), ico([...bySize].map(([size, data]) => ({ size, data }))))
writeFileSync(join(OUT, 'icon.png'), await png(512))
writeFileSync(FAVICON, bySize.get(256))

console.log(`icon.ico (${SIZES.join('/')} px) + icon.png (512) + favicon 已生成`)
