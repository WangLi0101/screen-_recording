/**
 * 下载当前平台对应的 ffmpeg 静态二进制到 resources/ffmpeg/<platform>-<arch>/。
 *
 * 二进制体积过大不入库（见 .gitignore），首次 clone 后执行一次即可：
 *   npm run fetch-ffmpeg
 *   npm run fetch-ffmpeg -- --force          # 覆盖已有文件
 *   npm run fetch-ffmpeg -- --arch=arm64     # 拉其它架构
 *
 * 源与 LICENSE 来自 ffmpeg-static 的 GitHub Release，可用环境变量替换：
 *   FFMPEG_RELEASE=b6.1.1
 *   FFMPEG_BINARIES_URL=https://your-mirror/ffmpeg-static/releases/download/b6.1.1
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { createGunzip } from 'node:zlib'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const release = process.env.FFMPEG_RELEASE || 'b6.1.1'
const baseUrl =
  process.env.FFMPEG_BINARIES_URL ||
  `https://github.com/eugeneware/ffmpeg-static/releases/download/${release}`

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const platform = arg('platform') || process.platform
const arch = arg('arch') || process.arch
const force = process.argv.includes('--force')

const SUPPORTED = ['win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64']
const key = `${platform}-${arch}`

if (!SUPPORTED.includes(key)) {
  console.error(`[fetch-ffmpeg] 不支持的平台：${key}（支持：${SUPPORTED.join(', ')}）`)
  process.exit(1)
}

const dir = join(root, 'resources', 'ffmpeg', key)
const name = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const dest = join(dir, name)

if (existsSync(dest) && !force) {
  const mb = (statSync(dest).size / 1024 / 1024).toFixed(1)
  console.log(`[fetch-ffmpeg] 已存在 ${key} · ${mb} MB，跳过（--force 可覆盖）`)
  process.exit(0)
}

mkdirSync(dir, { recursive: true })

/** GitHub 会 302 到 release-assets 的临时地址，手动跟随并流式落盘。 */
async function download(url, target) {
  let current = url
  for (let i = 0; i < 6; i += 1) {
    const res = await fetch(current, { redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) break
      current = new URL(location, current).toString()
      continue
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} · ${current}`)
    await pipeline(Readable.fromWeb(res.body), createWriteStream(target))
    return
  }
  throw new Error(`重定向次数过多或缺少 location：${url}`)
}

const gz = `${dest}.gz`
const tmp = `${dest}.downloading`

try {
  console.log(`[fetch-ffmpeg] 下载 ${key} ← ${baseUrl}/ffmpeg-${key}.gz`)
  await download(`${baseUrl}/ffmpeg-${key}.gz`, gz)
  await pipeline(createReadStream(gz), createGunzip(), createWriteStream(tmp))
  renameSync(tmp, dest)
  if (platform !== 'win32') chmodSync(dest, 0o755)

  const mb = statSync(dest).size / 1024 / 1024
  if (mb < 5) throw new Error(`解压后体积异常（${mb.toFixed(1)} MB），可能下载不完整`)
  console.log(`[fetch-ffmpeg] ok: ${key} · ${mb.toFixed(1)} MB`)

  try {
    const license = await fetch(`${baseUrl}/${key}.LICENSE`)
    if (license.ok) writeFileSync(join(dir, 'LICENSE.txt'), await license.text(), 'utf8')
    else console.warn(`[fetch-ffmpeg] 未取到 LICENSE（${license.status}），请手动补充`)
  } catch {
    console.warn('[fetch-ffmpeg] 未取到 LICENSE.txt，请手动补充')
  }

  if (platform === process.platform && arch === process.arch) {
    const out = execFileSync(dest, ['-hide_banner', '-version'], { encoding: 'utf8' })
    console.log(`[fetch-ffmpeg] ${out.split('\n')[0]?.trim()}`)
  }

  if (platform === 'darwin') {
    console.warn('[fetch-ffmpeg] 注意：evermeet 构建含 --enable-nonfree，不可再分发，')
    console.warn('[fetch-ffmpeg] 对外发布前请替换为自行构建的 LGPL 二进制（见 resources/ffmpeg/README.md）')
  }
} catch (error) {
  console.error(`[fetch-ffmpeg] 失败：${error.message}`)
  console.error('[fetch-ffmpeg] 网络受限时可设置 FFMPEG_BINARIES_URL 指向镜像后重试')
  for (const f of [gz, tmp]) if (existsSync(f)) unlinkSync(f)
  process.exit(1)
} finally {
  if (existsSync(gz)) unlinkSync(gz)
}