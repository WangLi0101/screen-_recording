import { protocol } from 'electron'
import { createReadStream, promises as fsp } from 'node:fs'
import { extname, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { getSettings } from './settings'

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
}

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app-media',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

export function registerMediaProtocol(): void {
  protocol.handle('app-media', async (request) => {
    const url = new URL(request.url)
    const raw = url.searchParams.get('p')
    if (!raw) return new Response('Bad request', { status: 400 })

    const root = resolve(getSettings().recordingsDir)
    const filePath = resolve(raw)
    const rel = relative(root, filePath)
    if (!rel || rel.startsWith('..') || rel.includes(`..${require('node:path').sep}`)) {
      return new Response('Forbidden', { status: 403 })
    }

    let stat
    try {
      stat = await fsp.stat(filePath)
    } catch {
      return new Response('Not found', { status: 404 })
    }
    if (!stat.isFile()) return new Response('Not found', { status: 404 })

    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const rangeHeader = request.headers.get('Range')

    if (!rangeHeader) {
      const stream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': type,
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store'
        }
      })
    }

    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader)
    if (!match) return new Response('Bad range', { status: 416 })

    const start = match[1] ? Number(match[1]) : 0
    let end = match[2] ? Number(match[2]) : stat.size - 1
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
      return new Response('Bad range', { status: 416 })
    }
    end = Math.min(end, stat.size - 1)

    const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream
    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store'
      }
    })
  })
}