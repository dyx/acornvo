const BODY_MAX = 16000;

interface RenderVars {
  title: string;
  url: string;
  body: string;
}

function truncateBody(body: string): string {
  if (body.length <= BODY_MAX) return body;
  return body.slice(0, BODY_MAX) + '\n\n...(内容过长已截断)';
}

export const reviewClip = {
  schema: {
    type: 'object',
    required: ['summary', 'suggestedTitle', 'tags', 'keyQuotes'],
    additionalProperties: false,
    properties: {
      summary: { type: 'string', minLength: 1 },
      suggestedTitle: { type: 'string', minLength: 1 },
      tags: {
        type: 'array',
        minItems: 3,
        maxItems: 8,
        items: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
      },
      keyQuotes: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: { type: 'string', minLength: 1 },
      },
    },
  } as const,

  render({ title, url, body }: RenderVars): { system: string; user: string } {
    const system = [
      '你是一位博学的中英双语阅读助手。',
      '你将收到一篇文章，输出对它的结构化评注。',
      '输出必须是严格的 JSON 对象，匹配指定 schema，不要包含任何额外文本，不要使用 markdown code fence。',
      'tags 必须使用 kebab-case 英文短词。summary 使用原文主语言（若中英混合则以中文为主）。',
    ].join('\n');

    const user = [
      `# 标题\n${title}`,
      `# 原始 URL\n${url}`,
      `# 正文（可能已被截断）\n${truncateBody(body)}`,
      '',
      '请生成：',
      '1. `summary`：150 字以内的摘要。',
      '2. `suggestedTitle`：一个更精炼、信息密度更高的标题（若原标题已足够好，可复用）。',
      '3. `tags`：3-8 个 kebab-case 英文短标签（如 "deep-learning", "transformer"）。',
      '4. `keyQuotes`：最重要的 1-3 句原文引用（保持原文语言）。',
      '',
      'JSON schema（自行遵守，勿输出 schema）：',
      '{ "summary": string, "suggestedTitle": string, "tags": string[], "keyQuotes": string[] }',
    ].join('\n');

    return { system, user };
  },
};
