import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { dbService } from '../../services/db'

const GetGroveStatsSchema = z.object({})

export const getGroveStatsTool = tool(
  async () => {
    const db = dbService.requireCurrent()
    const totalFiles = (db.prepare('SELECT COUNT(*) as c FROM files').get() as { c: number }).c
    const clippedFiles = (
      db.prepare('SELECT COUNT(*) as c FROM files WHERE clipped_at IS NOT NULL').get() as { c: number }
    ).c
    const totalTags = (db.prepare('SELECT COUNT(*) as c FROM tags').get() as { c: number }).c

    return {
      total_files: totalFiles,
      clipped_files: clippedFiles,
      total_tags: totalTags
    }
  },
  {
    name: 'get_grove_stats',
    description:
      'Get basic statistics about the user\'s grove (knowledge base), such as the total number of documents, total tags, and clipped web articles. Use this when the user asks "how many documents do I have?".',
    schema: GetGroveStatsSchema
  }
)

export default getGroveStatsTool
