import type { Clip } from '@shared/clip-types'
import { cleanUrl } from './enrich'

export interface ClipsLookup {
  getByUrl(url: string): Promise<Clip | null>
}

export interface Dedupe {
  findExisting(rawUrl: string): Promise<Clip | null>
}

/**
 * Wrap a clips.getByUrl lookup with URL cleaning so pipeline callers never
 * need to remember to strip tracking params before the dedupe check.
 */
export function createDedupe(lookup: ClipsLookup): Dedupe {
  return {
    async findExisting(rawUrl: string): Promise<Clip | null> {
      const cleaned = cleanUrl(rawUrl)
      return lookup.getByUrl(cleaned)
    }
  }
}
