// Dummy data for Acornvo prototype

const PROJECTS = [
  { id: 'main', name: '我的知识库', path: '~/Documents/Acornvo/主库', color: 'acorn', files: 487, lastOpened: '刚刚', pinned: true },
  { id: 'research', name: '论文研读', path: '~/Documents/Acornvo/research', color: 'leaf', files: 214, lastOpened: '2 小时前' },
  { id: 'writing', name: '写作素材', path: '~/Documents/writing-notes', color: 'berry', files: 93, lastOpened: '昨天' },
  { id: 'obsidian', name: 'Obsidian Vault', path: '~/Obsidian/Personal', color: 'sky', files: 1243, lastOpened: '3 天前' },
];

const BOOKMARKS = [
  { title: '注意力是你所需的一切', site: 'arxiv.org', favicon: 'A' },
  { title: '深度学习经典论文', site: 'zhihu.com', favicon: '知' },
  { title: 'The Attention Economy', site: 'stratechery.com', favicon: 'S' },
  { title: '产品经理的日常', site: 'medium.com', favicon: 'M' },
];

const BROWSER_TABS = [
  { id: 't1', title: '深度学习中的注意力机制 — 机器之心', url: 'jiqizhixin.com/articles/attention-mechanism', favicon: '机', active: true },
  { id: 't2', title: 'Google 搜索', url: 'google.com', favicon: 'G' },
  { id: 't3', title: 'GitHub - badlogic/pi-mono', url: 'github.com/badlogic/pi-mono', favicon: '◯' },
];

const FILES = [
  {
    path: '技术/深度学习/注意力机制综述.md',
    title: '深度学习中的注意力机制：从 Seq2Seq 到 Transformer',
    category: '技术/深度学习',
    rating: 5,
    tags: ['attention', 'transformer', '综述'],
    summary: '本文系统梳理了注意力机制的演进脉络，从 2014 年 Bahdanau 提出的加性注意力开始，到 2017 年 Transformer 的自注意力，再到近年的线性注意力与稀疏注意力变体。文章对每种机制的计算复杂度、适用场景做了详细对比。',
    highlights: ['自注意力机制的核心直觉是"查询-键-值"三元组的软寻址', 'Position encoding 的设计取舍决定了模型对序列位置的敏感性', '稀疏注意力在长上下文场景下比全注意力节省 10-100 倍计算'],
    clipped: '2026-04-17 10:30',
    reviewed: '2026-04-17 10:32',
    site: 'jiqizhixin.com',
    wordCount: 8432,
    status: 'reviewed',
  },
  {
    path: '果篮/20260417-transformer-survey.md',
    title: 'Transformer 架构综述 2026',
    category: '果篮',
    rating: null,
    tags: [],
    summary: null,
    clipped: '刚刚',
    reviewed: null,
    site: 'arxiv.org',
    wordCount: 12840,
    status: 'reviewing',
  },
  {
    path: '产品/设计原则/Don Norman 设计思考.md',
    title: 'Don Norman 谈设计思考的五个阶段',
    category: '产品/设计原则',
    rating: 4,
    tags: ['设计', '用户体验', '方法论'],
    summary: 'Don Norman 在本篇访谈中阐述了设计思考的五个阶段，强调从"人"出发的观察、定义、构思、原型、测试循环。他特别指出，设计师应当避免过早陷入技术细节。',
    clipped: '2026-04-16 15:20',
    reviewed: '2026-04-16 15:22',
    site: 'jnd.org',
    wordCount: 3210,
    status: 'reviewed',
  },
  {
    path: '技术/深度学习/RLHF 原理.md',
    title: '人类反馈强化学习（RLHF）原理与实践',
    category: '技术/深度学习',
    rating: 5,
    tags: ['RLHF', 'alignment', 'LLM'],
    summary: 'RLHF 通过奖励模型将人类偏好转化为可优化的信号，经过 PPO 等策略优化算法改进语言模型行为。本文梳理了其三阶段训练流程与常见陷阱。',
    clipped: '2026-04-15 09:12',
    reviewed: '2026-04-15 09:14',
    site: 'openai.com',
    wordCount: 5621,
    status: 'reviewed',
  },
  {
    path: '产品/竞品分析/Cubox 产品拆解.md',
    title: 'Cubox 产品拆解：稍后读赛道的差异化',
    category: '产品/竞品分析',
    rating: 3,
    tags: ['产品分析', '稍后读', 'Cubox'],
    summary: 'Cubox 在稍后读市场的差异化来自"跨平台 + AI 标签 + 卡片式 UI"。本文对比了 Instapaper、Pocket、Matter 等同类产品的定位。',
    clipped: '2026-04-14 20:45',
    reviewed: '2026-04-14 20:47',
    site: 'sspai.com',
    wordCount: 2834,
    status: 'reviewed',
  },
  {
    path: '随笔/2026春-读书笔记.md',
    title: '2026 年春季读书笔记',
    category: '随笔',
    rating: 4,
    tags: ['读书', '随笔'],
    summary: '本季度共读完 7 本书，涉及认知心理学、设计哲学与科技史。卡尼曼《噪声》给我最深刻的启发是判断的一致性往往比准确性更重要。',
    clipped: '2026-04-12 22:10',
    reviewed: '2026-04-12 22:12',
    site: '本地',
    wordCount: 4120,
    status: 'reviewed',
  },
  {
    path: '技术/工具链/Electron 性能调优.md',
    title: 'Electron 应用性能调优实战',
    category: '技术/工具链',
    rating: 4,
    tags: ['electron', '性能', 'node'],
    summary: '从主进程与渲染进程的通信瓶颈切入，介绍 IPC 批处理、WebContentsView 取代 BrowserView、原生模块预编译等实战技巧。',
    clipped: '2026-04-10 11:30',
    reviewed: '2026-04-10 11:31',
    site: 'electronjs.org',
    wordCount: 6210,
    status: 'reviewed',
  },
  {
    path: '果篮/20260416-design-systems.md',
    title: 'Design Systems at Scale',
    category: '果篮',
    rating: 2,
    tags: ['design-system', 'scale'],
    summary: '本文讨论设计系统在大规模组织中的落地挑战，包括组件治理、版本管理、跨团队对齐等痛点。',
    clipped: '2026-04-16 08:00',
    reviewed: '2026-04-16 08:02',
    site: 'medium.com',
    wordCount: 2100,
    status: 'reviewed',
  },
  {
    path: '技术/深度学习/LoRA 微调笔记.md',
    title: 'LoRA 微调技术笔记',
    category: '技术/深度学习',
    rating: 5,
    tags: ['LoRA', '微调', 'PEFT'],
    summary: 'LoRA 通过低秩矩阵分解实现参数高效微调，显著降低显存占用。本笔记记录了在 LLaMA-2 7B 上的微调实验。',
    clipped: '2026-04-08 14:22',
    reviewed: '2026-04-08 14:24',
    site: 'github.com',
    wordCount: 3890,
    status: 'reviewed',
  },
];

const CHAT_HISTORY = [
  { id: 'c1', title: 'Transformer 与 RNN 对比综述', updated: '刚刚', model: 'Claude Opus 4' },
  { id: 'c2', title: '帮我整理本周读的产品文章', updated: '2 小时前', model: 'DeepSeek' },
  { id: 'c3', title: '基于读书笔记生成年度总结', updated: '昨天', model: 'Claude Opus 4' },
  { id: 'c4', title: '从这 5 篇找共同观点', updated: '3 天前', model: 'DeepSeek' },
  { id: 'c5', title: '产品竞品对比表格', updated: '上周', model: 'Claude Opus 4' },
];

const CHAT_MESSAGES = [
  {
    role: 'user',
    content: '帮我基于 @注意力机制综述.md 和 @RLHF 原理.md 写一篇对比笔记，说明这两种技术的关联。保存到 技术/综述/ 目录下。',
    mentions: ['技术/深度学习/注意力机制综述.md', '技术/深度学习/RLHF 原理.md'],
  },
  {
    role: 'assistant',
    content: '我先读一下这两篇文档的全文，再对比它们在 LLM 训练流水线中的位置。',
    toolCalls: [
      { name: 'read_file', args: { path: '技术/深度学习/注意力机制综述.md' }, result: '已读取 8,432 字', status: 'done' },
      { name: 'read_file', args: { path: '技术/深度学习/RLHF 原理.md' }, result: '已读取 5,621 字', status: 'done' },
      { name: 'grep_files', args: { query: 'attention RLHF 训练' }, result: '找到 3 个相关文件', status: 'done' },
    ],
  },
  {
    role: 'assistant',
    content: '根据这两篇文档，我整理出三个关键关联：\n\n**1. 架构层与对齐层的分工**\n注意力机制是 Transformer 架构的核心组件，解决"如何让模型关注相关信息"。RLHF 则是训练流程的最后阶段，解决"如何让模型输出符合人类偏好"。两者分别回答了"能力"与"意图"的问题。\n\n**2. 都依赖可微分的梯度信号**\n自注意力的 softmax 权重和 RLHF 的奖励模型输出，本质上都是将离散选择软化为连续可优化信号。\n\n**3. 计算成本的非对称性**\nAttention 的复杂度随序列长度二次增长，RLHF 的 PPO 阶段需要同时维持四个模型实例。两者都推动了分布式训练基础设施的演进。\n\n准备写入新文件：',
    toolCalls: [
      { name: 'write_markdown', args: { path: '技术/综述/注意力与RLHF对比笔记.md' }, result: '已创建 2,140 字', status: 'done' },
    ],
  },
];

const USAGE_DAILY = [
  { day: '04-11', cost: 0.04, reviews: 3, chats: 1 },
  { day: '04-12', cost: 0.12, reviews: 8, chats: 3 },
  { day: '04-13', cost: 0.08, reviews: 5, chats: 2 },
  { day: '04-14', cost: 0.21, reviews: 12, chats: 5 },
  { day: '04-15', cost: 0.15, reviews: 9, chats: 4 },
  { day: '04-16', cost: 0.18, reviews: 11, chats: 3 },
  { day: '04-17', cost: 0.09, reviews: 4, chats: 2 },
];

const ARTICLE_MD = `# 深度学习中的注意力机制：从 Seq2Seq 到 Transformer

*作者：机器之心编译组 · 发布于 2026-03-15*

注意力机制（Attention Mechanism）已经成为现代深度学习架构的基石。本文系统梳理它的演进脉络。

## 缘起：Seq2Seq 的瓶颈

2014 年，Sutskever 等人提出的 Seq2Seq 模型用两个 RNN 分别做编码与解码。该架构有一个根本缺陷：所有输入信息被压缩进一个固定长度的上下文向量，长序列上丢失严重。

> "固定长度向量是神经机器翻译性能的瓶颈。" —— Bahdanau, 2014

## Bahdanau Attention

同年 Bahdanau 提出的加性注意力打破了这个瓶颈。解码器不再只看一个向量，而是对编码器所有时刻的隐状态做加权求和，权重由一个小型前馈网络计算。

## 自注意力与 Transformer

2017 年 Vaswani 等人的《Attention is All You Need》把注意力机制推到极致——完全抛弃 RNN，仅用自注意力堆叠构建编码器与解码器。

关键创新包括：

- **Multi-Head Attention**：并行多个注意力头，捕捉不同子空间的关联
- **Position Encoding**：用正弦/余弦函数注入位置信息
- **Residual + LayerNorm**：稳定深层堆叠的训练

## 近年变体

为缓解 O(n²) 复杂度，学界提出了大量稀疏与线性注意力变体：

1. Longformer 的滑动窗口 + 全局注意力
2. Performer 的随机特征近似
3. FlashAttention 的 IO 感知实现

每种方案在精度与效率间做了不同取舍。

## 结语

注意力的本质是"软寻址"：用相关性权重从记忆库中检索信息。这一简单思想催生了整个现代 AI 的架构。
`;

Object.assign(window, {
  PROJECTS, BOOKMARKS, BROWSER_TABS, FILES,
  CHAT_HISTORY, CHAT_MESSAGES, USAGE_DAILY, ARTICLE_MD,
});
