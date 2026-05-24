const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = `<html><body>
<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="https://mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=png" class="rich_pages wxw-img">
</body></html>`;

const dom = new JSDOM(html);
const document = dom.window.document;

const images = document.getElementsByTagName('img');
for (let i = 0; i < images.length; i++) {
  const img = images[i];
  const realSrc = img.getAttribute('data-src') || 
                  img.getAttribute('data-original') || 
                  img.getAttribute('data-actualsrc') ||
                  img.getAttribute('data-lazy-src');
  if (realSrc) {
    img.setAttribute('src', realSrc);
  }
}

console.log(document.body.innerHTML);
