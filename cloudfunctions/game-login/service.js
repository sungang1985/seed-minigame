const { createHash } = require('node:crypto');

function createIdentity(context, now = Date.now()) {
  const openid = context && context.OPENID;
  const appid = context && context.APPID;
  if (typeof openid !== 'string' || !openid.trim() ||
      typeof appid !== 'string' || !appid.trim()) {
    const error = new Error('仅支持小游戏通过微信云开发调用登录');
    error.code = 'UNAUTHENTICATED';
    throw error;
  }
  if (!Number.isSafeInteger(now) || now < 0) throw new TypeError('服务器时间无效');
  const id = createHash('sha256').update(`${appid.trim()}:${openid.trim()}`).digest('hex');
  return {
    user: { id, displayName: `星光旅人${id.slice(0, 4).toUpperCase()}` },
    issuedAt: now,
  };
}

module.exports = { createIdentity };
