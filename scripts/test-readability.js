const jsdom = require('jsdom');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = jsdom;

const html = `<html><head><title>Test</title></head><body>
<div id="js_article" class="rich_media">
  <div class="rich_media_content">
    <p>Test paragraph</p>
    <img data-src="https://mmbiz.qpic.cn/mmbiz_png/test/640?wx_fmt=png" class="rich_pages wxw-img" />
    <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="https://mmbiz.qpic.cn/mmbiz_jpg/test2/640" />
  </div>
</div>
</body></html>`;

const dom = new JSDOM(html);
const document = dom.window.document;
const docClone = document.cloneNode(true);

const images = docClone.getElementsByTagName('img');
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

const reader = new Readability(docClone);
const article = reader.parse();
console.log(article.content);
