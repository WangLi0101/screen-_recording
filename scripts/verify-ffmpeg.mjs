/**
 * Release gate: ffmpeg is vendored in `resources/ffmpeg/<platform>-<arch>/` and
 * shipped via electron-builder `extraResources`, so end users never need a
 * system ffmpeg. A missing/corrupt binary would silently degrade export to
 * "原样复制" only, so fail the build here instead.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const archDir = `${process.platform}-${process.arch}`
const bin = join(root, 'resources', 'ffmpeg', archDir, name)

if (!existsSync(bin) || !statSync(bin).isFile()) {
  console.error(`[verify-ffmpeg] 缺少 ${archDir} 的 ffmpeg 二进制：${bin}`)
  console.error('[verify-ffmpeg] 请把对应平台的 ffmpeg 放进 resources/ffmpeg/<platform>-<arch>/')
  console.error('[verify-ffmpeg] 参考 resources/ffmpeg/README.md')
  process.exit(1)
}

const sizeMb = statSync(bin).size / 1024 / 1024
if (sizeMb < 5) {
  console.error(`[verify-ffmpeg] 二进制体积异常（${sizeMb.toFixed(1)} MB），可能下载不完整：${bin}`)
  process.exit(1)
}

// git on Windows cannot store the executable bit, so normalise it before packing.
if (process.platform !== 'win32') {
  try {
    chmodSync(bin, 0o755)
  } catch {
    // ignore; runtime chmod handles it too
  }
}

try {
  const out = execFileSync(bin, ['-hide_banner', '-version'], { encoding: 'utf8' })
  const firstLine = out.split('\n')[0]?.trim()
  console.log(`[verify-ffmpeg] ok: ${archDir} · ${sizeMb.toFixed(1)} MB · ${firstLine}`)
} catch (error) {
  console.error(`[verify-ffmpeg] 无法执行 ${bin}：${error.message}`)
  process.exit(1)
}

for (const other of ['win32-x64', 'darwin-x64', 'darwin-arm64']) {
  if (other === archDir) continue
  const otherName = other.startsWith('win32') ? 'ffmpeg.exe' : 'ffmpeg'
  if (!existsSync(join(root, 'resources', 'ffmpeg', other, otherName))) {
    console.warn(`[verify-ffmpeg] 提示：缺少 ${other} 的二进制，构建该平台时会失败（当前平台不受影响）`)
  }
}