export interface MarkdownChunk {
  heading_path: string;
  body: string;
}

/**
 * Splits a Markdown document into chunks based on H2 (##) and H3 (###) headings.
 * Ignores headings inside code blocks. H1 (#) and H4+ (####) are treated as regular text.
 */
export function chunkMarkdown(body: string): MarkdownChunk[] {
  const lines = body.split('\n');
  const chunks: MarkdownChunk[] = [];
  
  let currentPath: string[] = [];
  let currentBody: string[] = [];
  let inCodeBlock = false;

  const flushChunk = () => {
    // Only flush if there's actual content (beyond just whitespace)
    if (currentBody.some(line => line.trim().length > 0)) {
      chunks.push({
        heading_path: currentPath.join(' > '),
        body: currentBody.join('\n')
      });
    }
    currentBody = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentBody.push(line);
      continue;
    }

    if (!inCodeBlock) {
      const match = line.match(/^(##|###)\s+(.*)$/);
      if (match) {
        const level = match[1].length; // 2 or 3
        const title = match[2].trim();

        // Before starting a new chunk, flush the current one
        flushChunk();

        // Update heading path
        if (level === 2) {
          currentPath = [title];
        } else if (level === 3) {
          if (currentPath.length >= 1) {
            currentPath = [currentPath[0], title];
          } else {
            currentPath = [title];
          }
        }
        
        currentBody.push(line);
        continue;
      }
    }

    currentBody.push(line);
  }

  flushChunk();
  
  return chunks;
}
