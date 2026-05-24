function absolutiseUrls(html, baseUrl) {
  const NON_HTTP_SCHEMES = /^(mailto:|tel:|javascript:|data:|#)/i;
  let base;
  try {
    base = new URL(baseUrl)
  } catch {
    return html
  }
  function rewrite(value) {
    if (!value || NON_HTTP_SCHEMES.test(value)) return value
    try {
      return new URL(value, base).href
    } catch {
      return value
    }
  }
  let s = html.replace(/(\shref=")([^"]*)(")/gi, (_m, p1, v, p3) => `${p1}${rewrite(v)}${p3}`)
  s = s.replace(/(\ssrc=")([^"]*)(")/gi, (_m, p1, v, p3) => `${p1}${rewrite(v)}${p3}`)
  return s
}

console.log(absolutiseUrls('<img src="https://mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=png">', 'https://mp.weixin.qq.com/s/123'));
console.log(absolutiseUrls('<img src="//mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=png">', 'https://mp.weixin.qq.com/s/123'));
console.log(absolutiseUrls("<img src='https://mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=png'>", 'https://mp.weixin.qq.com/s/123'));
