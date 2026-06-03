import { searchFilesTool } from './search_files'
import { getGroveStatsTool } from './get_grove_stats'

export const agentTools = [
  searchFilesTool,
  getGroveStatsTool
] as const

export type AgentTool = (typeof agentTools)[number]
