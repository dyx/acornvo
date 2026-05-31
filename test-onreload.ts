import { useExternalStoreRuntime } from '@assistant-ui/react';
const runtime = useExternalStoreRuntime({
  messages: [],
  isRunning: false,
  onNew: async () => {},
  onReload: async (parentId) => {},
});
