import { searchFilesTool } from './search_files';
import { readFileTool } from './read_file';
import { listTagsTool } from './list_tags';
import { updateFrontmatterTool } from './update_frontmatter';
import { clipSummaryTool } from './clip_summary';

export const agentTools = [
  searchFilesTool,
  readFileTool,
  listTagsTool,
  updateFrontmatterTool,
  clipSummaryTool,
] as const;

export type AgentTool = (typeof agentTools)[number];
