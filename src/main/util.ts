import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const text = await fsp.readFile(file, 'utf8')
    return JSON.parse(text.replace(/^\uFEFF/, '')) as T
  } catch {
    return fallback
  }
}

export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fsp.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fsp.rename(tmp, file)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function sanitizeFileName(input: string): string {
  return input
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120)
}

export async function uniquePath(file: string): Promise<string> {
  try {
    await fsp.access(file)
  } catch {
    return file
  }
  const dir = dirname(file)
  const ext = file.slice(file.lastIndexOf('.'))
  const base = file.slice(0, file.length - ext.length)
  for (let i = 1; i < 1000; i++) {
    const candidate = join(dir, `${base} (${i})${ext}`)
    try {
      await fsp.access(candidate)
    } catch {
      return candidate
    }
  }
  return join(dir, `${base} (${Date.now()})${ext}`)
}

export function defaultTitle(ts = Date.now()): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `录制 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}