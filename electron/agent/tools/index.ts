import { searchFilesTool } from './search_files'
import { readFileTool } from './read_file'
import { updateFrontmatterTool } from './update_frontmatter'
import { clipSummaryTool } from './clip_summary'
import { getGroveStatsTool } from './get_grove_stats'

export const agentTools = [
  searchFilesTool,
  readFileTool,
  updateFrontmatterTool,
  clipSummaryTool,
  getGroveStatsTool
] as const

export type AgentTool = (typeof agentTools)[number]
