import type { IpcContract } from '@shared/ipc-contract';
import { IpcError } from '@shared/ipc-contract';
import { aiUsage } from '../ai/usage';
import { getQueueBootstrap } from '../queue';

function requireStore() {
  const b = getQueueBootstrap();
  if (!b) throw new IpcError('E_NOT_FOUND', 'no grove opened (queue not initialized)');
  return b.store;
}

export const aiHandlers: IpcContract['ai'] = {
  async reviewClip(clipId, opts) {
    const force = opts?.force === true;
    const dedupeKey = force ? `clip:${clipId}:force:${Date.now()}` : `clip:${clipId}`;
    const { id } = requireStore().enqueue('ai-review-clip', { clipId, force }, { dedupeKey });
    return { jobId: id };
  },

  async ['usage.summary'](opts) {
    return aiUsage.summary(opts);
  },

  async ['usage.list'](opts) {
    return aiUsage.list(opts);
  },
};
