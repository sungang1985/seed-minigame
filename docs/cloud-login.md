# 微信云身份登录

游戏通过微信原生 `wx.cloud` 调用 `game-login` 云函数。云函数从 `cloud.getWXContext()` 读取可信的 `OPENID` 和 `APPID`，生成游戏内标识及默认称呼，不接收客户端声明的用户身份。

这是微信云开发的原生身份链路，不需要额外调用 `wx.login`、交换 `code2session` 或签发客户端 token，也不需要在项目里配置 AppSecret。微信基础库会把调用身份传给云函数，相关机制见 [CloudBase 云函数接入说明](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram) 和 [微信小游戏原生 API 快速开始](https://docs.cloudbase.net/quick-start/frameworks/wechat-minigame-native)。

## 部署一次云函数

1. 在微信公众平台注册并取得本游戏的**小游戏 AppID**，在项目发布配置中填写。游客 AppID 不能验证真实登录。
2. 使用关联这个 AppID 的微信公众平台账号开通云开发环境，复制环境 ID，并填入客户端的 `cloudEnv` 配置。环境必须与小游戏关联。
3. 在微信开发者工具中打开项目根目录，进入云开发面板并选择该环境。确认项目 `cloudfunctionRoot` 指向 `cloudfunctions/`。
4. 右键 `cloudfunctions/game-login`，选择**上传并部署：云端安装依赖**。运行时选择 Node.js 18 或更新的兼容版本。部署目录已包含固定版本 `wx-server-sdk@4.0.2`，版本来源为 [官方 npm 包](https://www.npmjs.com/package/wx-server-sdk)；客户端无需构建 npm。
5. 在已登录微信的真机中打开游戏，主动点击登录，确认返回「星光旅人…」身份。退出后应恢复游客，断网时应提示失败并允许重试。

这个云函数不使用数据库，不需要创建集合或配置客户端数据库权限。源码包含完整云函数，但本次本地构建不代表已经完成云部署；真实 AppID、环境关联、云函数部署和真机验收完成后，登录才可用。

## 身份和数据范围

- 用户点击登录后才调用云函数；浏览器预览没有微信身份，不伪造登录成功。
- 返回用户 ID 是 `SHA-256(APPID + ':' + OPENID)`，原始 OpenID 不返回给客户端。默认称呼从这个标识派生，不读取微信头像、昵称或手机号。
- 云函数不写入自建数据库。哈希标识仍属于可关联用户的标识，发布时应在本游戏的隐私说明中说明用途；云平台自身的日志和服务行为由微信云开发管理。
- 登录状态仅存放在当前游戏进程内，不把用户 ID、token 或成功标记写入本地存储。重新进入游戏后需要再次主动登录。
- 「退出登录」只清除本机当前会话，不撤销微信客户端身份，也不删除微信账号。正在进行的登录会被取消，其迟到响应不能恢复身份。
- 成绩与声音设置沿用本机存储，没有云端排行榜或跨设备成绩同步。后续添加受保护的云业务时，服务端仍须逐次使用可信微信上下文鉴权，不能把这个客户端用户 ID 当作认证凭据。

## 开发接口

```js
const AuthService = require('./services/AuthService');
const auth = new AuthService(platform, {
  cloudEnv: '你的环境ID',
  functionName: 'game-login',
});

const off = auth.onChange(({ status, user, error }) => {
  // status: guest / loading / authenticated / error
});

auth.login().then(user => console.log(user.displayName)).catch(error => {
  // 展示可重试提示，不把网络失败标记为登录成功。
});

auth.logout();
off();
auth.destroy();
```

同一时刻的登录请求会共享一个 Promise；默认 15 秒超时。重复点击不会创建并发登录，退出或销毁会阻止旧请求恢复状态。云环境没有配置、网络不可用、云函数未部署或返回格式错误时，均保持未登录并返回错误。
