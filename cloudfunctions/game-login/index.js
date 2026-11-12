const cloud = require('wx-server-sdk');
const { createIdentity } = require('./service');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 身份只来自微信可信调用上下文；不读取 event 中的用户 ID、openid 或昵称。
exports.main = async () => createIdentity(cloud.getWXContext());
