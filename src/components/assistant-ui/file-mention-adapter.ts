import { useEffect, useState, useMemo } from 'react';
import { unstable_useMentionAdapter, type Unstable_TriggerAdapter } from '@assistant-ui/react';
import type { FileSummary } from '@shared/file-types';
import { create } from 'zustand';

export const useFileMentionStore = create<{
  files: FileSummary[];
  addFile: (f: FileSummary, toast: (options: any) => void) => void;
  removeFile: (path: string) => void;
  clearFiles: () => void;
}>((set) => ({
  files: [],
  addFile: (f, toast) => set((state) => {
    if (state.files.some(existing => existing.path === f.path)) {
      return state;
    }
    if (state.files.length >= 5) {
      toast({
        variant: "destructive",
        description: "最多只能选择 5 个文件作为附件。"
      });
      return state;
    }
    return { files: [...state.files, f] };
  }),
  removeFile: (path) => set((state) => ({ files: state.files.filter(f => f.path !== path) })),
  clearFiles: () => set({ files: [] })
}));

export function useFileMentionAdapter() {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState<FileSummary[]>([]);

  useEffect(() => {
    let active = true;
    const fetchFiles = async () => {
      try {
        const results = await window.api.search.suggest(query);
        if (active) {
          setFiles(results || []);
        }
      } catch (err) {
        console.error('Failed to fetch file suggestions for mention:', err);
      }
    };
    
    // Simple debounce
    const timer = setTimeout(fetchFiles, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const items = useMemo(() => {
    return files.map((f) => ({
      id: f.path,
      label: f.title || f.path.split('/').pop() || f.path,
      metadata: {
        fileInfo: f
      }
    }));
  }, [files]);

  // Use the built-in mention adapter to handle basic formatting and item wrapping
  const baseAdapter = unstable_useMentionAdapter({ items });

  // Override the search method to capture the query text to trigger our async fetch
  const adapter: Unstable_TriggerAdapter = {
    ...baseAdapter.adapter,
    search: (q) => {
      setQuery(q);
      return baseAdapter.adapter.search(q); // let base adapter also filter if needed
    }
  };

  return {
    adapter,
    files
  };
}
