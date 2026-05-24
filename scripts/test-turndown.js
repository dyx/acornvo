const TurndownService = require('turndown');
const td = new TurndownService();
const html = '<img src="https://mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=png&amp;tp=webp" alt="img" />';
console.log(td.turndown(html));
