# 星星收集 · 微信小游戏 v1.1.0

原生 JavaScript + Canvas 2D 的 30 秒收集小游戏，支持游客游玩、微信云身份登录、原创音乐与音效、声音开关、隐私说明和好友分享。客户端没有第三方运行依赖，无需构建 npm。

## 运行与交付状态

项目包含完整客户端、登录云函数和发布工具。当前尚无真实小游戏 AppID 和云开发环境 ID，默认可体验游客流程；候选包不代表云函数已部署、真机已验收或微信审核已完成。

浏览器预览需要 Node.js 18 或更新版本，在源码根目录执行：

```bash
npm run dev
```

打开 <http://localhost:3000>。首次点击后播放背景音乐，声音偏好和最高纪录保存在本机。浏览器不具备微信身份，不会模拟登录成功。

微信开发者工具选择小游戏，导入包含 `project.config.json` 的项目根目录。默认 `touristappid` 仅用于工具允许的游客体验，真实登录和上传需自己的小游戏 AppID。

## 生成发布包

在 `release.config.json` 填写真实 `appId` 和已关联的 `cloudEnv`：

```bash
npm run check
npm test
npm run release
```

生成 `dist/seed-minigame-1.1.0/` 和同名 ZIP，内含可导入开发者工具的原生客户端、素材、云函数、导入文档和 SHA256 文件清单。缺少有效账号配置时，严格发布命令会明确失败。

账号尚未配置时可先生成候选包：

```bash
npm run release:candidate
npm run release:verify
```

缺项与部署步骤记录在 `RELEASE_STATUS.json` 中。打包只改生成目录中的账号配置，源码预览保留游客配置。微信账号绑定、云函数部署、真机验收、上传和平台审核仍需在对应账号中完成，详见 [发布说明](docs/release.md)。

## 真实微信登录

用户主动点击登录后，`wx.cloud.callFunction()` 调用 `game-login`。云函数从可信微信上下文获取身份，返回本游戏专用的 SHA-256 玩家标识与「星光旅人…」称呼，不读取头像、昵称或手机号，不生成客户端假 token。

在与本游戏关联的云开发环境中，右键 `cloudfunctions/game-login`，选择“上传并部署：云端安装依赖”。已固定 `wx-server-sdk@4.0.2`，无需数据库、AppSecret 或自建登录服务器。步骤见 [云登录说明](docs/cloud-login.md)。

登录状态只保存在当前进程，退出后恢复游客。最高纪录和声音偏好仅存本机；当前没有云存档、跨设备成绩同步或排行榜。数据用途见 [数据说明](docs/data-usage.md)。

## 音频与分享

- `bgm.wav`：10 秒原创五声音阶循环音乐。
- `collect.wav`、`start.wav`、`finish.wav`、`tap.wav`：收集、开始、结算与按钮音效。
- 五个音频为 22,050 Hz 单声道 16 bit PCM WAV，合计约 532 KiB；[CC0 授权](minigame/assets/audio/LICENSE.txt) 随包提供。
- 首页和暂停页可切换声音；切后台暂停，返回后恢复，尊重微信设备静音设置。
- 结果页可唤起微信好友分享，使用固定标题及原创图案；不读取通讯录、不提供分享奖励，也不把唤起分享当作已送达。

音频可用 `npm run audio:generate` 重现。图标与分享图位于 `minigame/assets/icon.png`、`share.png`，来源见 [图案说明](minigame/assets/ARTWORK_LICENSE.txt)。

## 目录与扩展

```text
release.config.json             发布名称、版本、AppID、云环境
project.config.json             微信开发者工具配置
minigame/game.js / game.json     原生入口与竖屏配置
minigame/assets/                原创音频、图标和分享图
minigame/src/config/            游戏、音频与发布配置
minigame/src/core/              循环、场景、事件
minigame/src/platform/          微信和浏览器适配
minigame/src/services/          登录、声音、资源、存储、请求
minigame/src/scenes/            首页、游戏、结算
cloudfunctions/game-login/      可信微信身份云函数
docs/                          发布、登录和数据说明
scripts/                       预览、检查、素材生成与打包
tests/                         核心、服务、平台、场景和打包测试
```

继承 `src/core/Scene` 并在 `src/main.js` 注册场景。每次切换会创建新实例，`this.listen()` 订阅在退出时自动释放。宽度固定为 375 逻辑坐标，高度随窗口比例变化；安全区表示边距，触摸坐标已转换，`update(dt)` 单位为秒。

```javascript
game.scenes.change('play');
game.sound.setMuted(true);
game.storage.set('coins', 10);
game.auth.login().then(user => console.log(user.displayName)).catch(console.error);
game.notify('准备好收集星光了吗');
```

HTTP 服务保留，可通过 `game.request.baseUrl` 配置合法域名。云登录不需要额外 HTTP 登录接口；新增受保护的服务端业务仍应逐次使用可信微信上下文鉴权，不能信任客户端玩家 ID。

自动测试覆盖登录竞态、失败重试、音频生命周期、游戏交互和包内容，不替代微信开发者工具编译、实际云部署与真机验收。
