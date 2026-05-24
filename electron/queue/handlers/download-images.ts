import type { JobHandler } from '../runner'
import { getCurrent } from '../../services/grove'
import { parseFile } from '../../services/frontmatter'
import { fileHandlers } from '../../ipc/file'
import { logger } from '../../services/logger'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

const BACKOFF_MS = [5_000, 30_000, 120_000]
function nextDelay(attempts: number): number | null {
  if (attempts >= BACKOFF_MS.length) return null
  return BACKOFF_MS[attempts]
}

function getExtFromMime(mime: string | null): string {
  if (!mime) return '.png' // default
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg'
  if (mime.includes('png')) return '.png'
  if (mime.includes('gif')) return '.gif'
  if (mime.includes('webp')) return '.webp'
  if (mime.includes('svg')) return '.svg'
  return '.png'
}

export const downloadClipImagesHandler: JobHandler = async (ctx) => {
  const { job, payload, log } = ctx
  const relPath = payload.path as string

  logger.info('[download-clip-images] handler start', { jobId: job.id, path: relPath, attempt: job.attempts })

  try {
    const grove = getCurrent()
    if (!grove) throw new Error('E_FILE_NOT_FOUND no grove opened')

    const absPath = path.join(grove.path, relPath)
    if (!fs.existsSync(absPath)) {
      throw new Error('E_FILE_NOT_FOUND file not found')
    }

    const stat = fs.statSync(absPath)
    const raw = fs.readFileSync(absPath, 'utf8')
    const { frontmatter, body } = parseFile(raw)

    // Regex to match markdown images: ![alt](url "title")
    // Note: We don't want to replace already local images or data URIs
    const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g
    const matches = Array.from(body.matchAll(imgRegex))

    if (matches.length === 0) {
      log('info', `download-clip-images no images to download in ${relPath}`)
      return { kind: 'ok' }
    }

    // Prepare assets directory: .assets/<filename-without-ext>/
    const parsedPath = path.parse(relPath)
    const assetsRelDir = path.posix.join(parsedPath.dir, '.assets', parsedPath.name)
    const assetsAbsDir = path.join(grove.path, assetsRelDir)

    if (!fs.existsSync(assetsAbsDir)) {
      fs.mkdirSync(assetsAbsDir, { recursive: true })
    }

    let newBody = body
    let downloadedCount = 0

    for (const match of matches) {
      const fullMatch = match[0]
      const alt = match[1]
      const url = match[2]

      try {
        const urlHash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8)
        
        // Fetch image
        const resp = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          }
        })

        if (!resp.ok) {
          logger.warn('[download-clip-images] failed to fetch image', { url, status: resp.status })
          continue
        }

        const buffer = await resp.arrayBuffer()
        const mime = resp.headers.get('content-type')
        const ext = getExtFromMime(mime)
        
        const filename = `${urlHash}${ext}`
        const fileAbsPath = path.join(assetsAbsDir, filename)
        
        fs.writeFileSync(fileAbsPath, Buffer.from(buffer))

        // Replace in body. We use encodeURI for the path just in case
        const newRelUrl = path.posix.join('.assets', parsedPath.name, filename)
        const newImgTag = `![${alt}](${newRelUrl})`
        
        newBody = newBody.replace(fullMatch, newImgTag)
        downloadedCount++
      } catch (err) {
        logger.warn('[download-clip-images] error downloading image', { url, error: (err as Error).message })
      }
    }

    if (downloadedCount > 0 && newBody !== body) {
      try {
        await fileHandlers.writeParsed(relPath, frontmatter as Record<string, unknown>, newBody, {
          expectedMtime: stat.mtimeMs
        })
        log('info', `download-clip-images ok path=${relPath} downloaded=${downloadedCount}`)
      } catch (e) {
        const code = (e as { code?: string })?.code
        if (code === 'E_MTIME_MISMATCH') {
          throw new Error('E_MTIME_CONFLICT')
        }
        throw e
      }
    } else {
      log('info', `download-clip-images skipped or no successful downloads path=${relPath}`)
    }

    return { kind: 'ok' }
  } catch (e) {
    const err = e as { message?: string }
    const msg = err.message || 'E_UNKNOWN'

    log('warn', `download-clip-images error path=${relPath} msg=${msg}`)

    if (msg.includes('E_FILE_NOT_FOUND')) {
      return { kind: 'fail', error: 'E_FILE_NOT_FOUND' }
    }

    if (msg.includes('E_MTIME_CONFLICT')) {
      return { kind: 'retry', delayMs: 60_000, reason: 'mtime-conflict' }
    }

    const delay = nextDelay(job.attempts)
    if (delay === null) {
      return { kind: 'fail', error: msg }
    }
    return { kind: 'retry', delayMs: delay, reason: msg }
  }
}
