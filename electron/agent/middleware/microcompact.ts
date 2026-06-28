import { ToolMessage } from '@langchain/core/messages'

const KEEP_RECENT = 6
const MIN_CLEAR_CHARS = 512
const CLEARABLE_TOOLS = ['search_files', 'list_files']
const PLACEHOLDER = '[此历史工具的大段返回结果已由系统自动折叠并清理，以释放上下文内存。**您无需重新调用该工具**，请直接基于您记忆中的已知信息继续推进当前任务。]'

export const microcompactMiddleware = {
  name: 'Microcompact',
  beforeModel: async (state: any) => {
    const replacements: any[] = []
    const total = state.messages.length
    
    // We only care about tools not in the last KEEP_RECENT messages
    for (let i = 0; i < total - KEEP_RECENT; i++) {
      const msg = state.messages[i]
      if (ToolMessage.isInstance(msg)) {
        if (msg.name && CLEARABLE_TOOLS.includes(msg.name) && typeof msg.content === 'string' && msg.content.length > MIN_CLEAR_CHARS) {
          replacements.push(new ToolMessage({
            id: msg.id,
            tool_call_id: msg.tool_call_id,
            name: msg.name,
            content: PLACEHOLDER
          }))
        }
      }
    }
    
    if (replacements.length > 0) {
      return { messages: replacements }
    }
    return {}
  }
}
