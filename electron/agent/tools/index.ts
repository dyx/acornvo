import { searchFilesTool } from './search_files'
import { listFilesTool } from './list_files'

export const agentTools = [searchFilesTool, listFilesTool] as const

export type AgentTool = (typeof agentTools)[number]
