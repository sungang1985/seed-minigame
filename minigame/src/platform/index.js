const WeChatPlatform = require('./WeChatPlatform');
const BrowserPlatform = require('./BrowserPlatform');

function createPlatform() {
  if (typeof wx !== 'undefined' && typeof wx.createCanvas === 'function') {
    return new WeChatPlatform(wx);
  }
  if (typeof document !== 'undefined') return new BrowserPlatform();
  throw new Error('请在微信开发者工具或浏览器预览中运行');
}

module.exports = createPlatform;
