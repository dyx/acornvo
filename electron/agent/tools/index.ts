import { searchFilesTool } from './search_files'
import { clipSummaryTool } from './clip_summary'
import { getGroveStatsTool } from './get_grove_stats'

export const agentTools = [
  searchFilesTool,
  clipSummaryTool,
  getGroveStatsTool
] as const

export type AgentTool = (typeof agentTools)[number]
