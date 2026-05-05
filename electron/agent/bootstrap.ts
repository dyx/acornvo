import type { Registry } from './registry';
import searchFiles from './tools/search_files';
import readFile from './tools/read_file';
import listTags from './tools/list_tags';
import updateFrontmatter from './tools/update_frontmatter';
import clipSummary from './tools/clip_summary';

export function bootstrapAgent(registry: Registry): void {
  for (const tool of [searchFiles, readFile, listTags, updateFrontmatter, clipSummary]) {
    registry.register(tool);
  }
  for (const t of registry.list()) {
    if (!t.description?.trim()) throw new Error(`agent self-check: tool ${t.name} has empty description`);
    if (!(t.parameters as any)?.type) throw new Error(`agent self-check: tool ${t.name} parameters missing type`);
  }
}
