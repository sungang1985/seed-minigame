# 微信小游戏基础框架

原生 JavaScript + Canvas 2D，无第三方运行依赖。包含可运行的「星星收集」演示，以及浏览器预览、微信平台适配和基础服务。适合作为轻量 2D 微信小游戏的起点。

## 运行

### 微信开发者工具

1. 安装微信开发者工具，选择 **小游戏 → 导入项目**。
2. 项目目录选择本仓库根目录（包含 `project.config.json`），代码目录已配置为 `minigame/`。
3. 将 `project.config.json` 的 `appid` 从 `touristappid` 换成自己的**小游戏 AppID**，然后编译。工具支持游客模式时也可先选择游客模式体验。
4. 使用真机调试检查触摸、安全区、音频和前后台切换。上传、预览二维码和发布需要有效 AppID 及对应权限。

微信端直接运行 `minigame/game.js`，不需要执行 npm 安装、构建或「构建 npm」。

### 浏览器预览

需要 Node.js 18 或更新版本，在仓库根目录执行：

```bash
npm run dev
```

打开 <http://localhost:3000>。支持鼠标、触屏，以及三种屏幕尺寸。修改源码后刷新页面。可用 `PORT=3001 npm run dev` 更换端口。

预览直接使用同一套游戏逻辑，开发服务器会在内存中打包 CommonJS 模块。浏览器通过 localStorage、HTML Audio 和 fetch 模拟相应能力；微信 API 行为仍需在开发者工具和真机上确认。

```bash
npm run check   # 语法、JSON 与预览模块依赖检查
npm test        # 核心生命周期、平台适配和服务回归测试
```

## 已包含

- 游戏循环：秒制 deltaTime、时间步长上限、前后台暂停恢复、销毁清理。
- 屏幕适配：375 逻辑宽度、动态高度、高 DPI、底部安全区和微信右上角胶囊避让。
- 场景管理：注册、切换、独立实例、生命周期、场景事件自动解绑。
- 输入：微信触摸与浏览器 Pointer Events 统一，支持点按、拖动和取消。
- 资源：图片预加载、进度、缓存、并发去重、失败重试与清理。
- 服务：事件总线、命名空间存储、音频静音和前后台恢复、Promise HTTP 请求。
- 演示：开始 → 30 秒收集星星 → 暂停/继续 → 结算 → 重玩/返回，保存最高纪录。

## 目录

```text
project.config.json             微信开发者工具项目配置
minigame/
  game.js                       微信入口
  game.json                     竖屏配置
  assets/                       图片、音频等本地资源
  src/
    main.js                     创建 Game 并注册场景
    config/game.js              逻辑宽度、DPR、调试开关、资源清单
    core/                       Game / Scene / SceneManager / EventBus
    platform/                   WeChatPlatform / BrowserPlatform
    services/                   Storage / ResourceManager / AudioManager / Request
    scenes/                     MenuScene / PlayScene / ResultScene
    ui/draw.js                  Canvas 绘图工具
preview/index.html              浏览器预览外壳
scripts/                        零依赖开发服务器和检查工具
tests/                          Node.js 回归测试
```

## 添加场景

创建 `minigame/src/scenes/MyScene.js`：

```javascript
const Scene = require('../core/Scene');

class MyScene extends Scene {
  enter(data) {
    this.elapsed = 0;
    this.listen('game:pause', () => {
      // 清除当前场景的拖动、按键等临时状态。
    });
  }

  update(dt) {
    this.elapsed += dt;
  }

  render(ctx) {
    ctx.fillStyle = '#101f32';
    ctx.fillRect(0, 0, this.game.width, this.game.height);
  }

  onPointer(event) {
    // type: down / move / up / cancel
    // x、y 已转换为逻辑坐标，id 表示触点。
    if (event.type === 'down') this.game.scenes.change('menu');
  }

  exit() {
    // 释放场景自己创建的定时器等资源。
  }
}

module.exports = MyScene;
```

在 `src/main.js` 中引入并调用 `game.scenes.register('my-scene', MyScene)`，然后通过 `game.scenes.change('my-scene', { ... })` 进入。每次进入都会创建新实例；`this.listen()` 的事件监听会在退出时自动释放。异步操作和定时器由场景自行取消。

`game.width` 固定为 375，`game.height` 根据窗口比例计算；`game.safeArea` 的四个值都是逻辑坐标的**边距**。渲染和输入都使用逻辑坐标。调试 FPS 可在 `src/config/game.js` 设置 `debug: true`。

## 资源与服务

将资源放在 `minigame/assets/`，在 `src/config/game.js` 添加清单：

```javascript
assets: [
  { key: 'hero', type: 'image', src: 'assets/hero.png' },
]
```

框架完成预加载后进入首页，可通过 `game.resources.get('hero')` 获取图片并调用 `ctx.drawImage()`。同一 key 不可绑定不同路径；加载失败会显示失败提示并记录控制台错误，修复后重新进入。演示使用程序绘图，默认资源清单为空。

```javascript
game.storage.set('coins', 10);
const coins = game.storage.get('coins', 0);

game.audio.play('bgm', 'assets/bgm.mp3', { loop: true, volume: 0.5 });
game.audio.setMuted(true);  // 偏好会持久化
game.audio.stop('bgm');

const unsubscribe = game.events.on('game:score', ({ score }) => {
  console.log(score);
});
unsubscribe();

// 自行配置真实后端，返回 { statusCode, data, header }；非 2xx 会拒绝。
game.request.baseUrl = 'https://your-api.example.com';
game.request.get('/profile').then(({ data }) => console.log(data)).catch(console.error);
```

音频资源需要自行添加；在用户触摸回调中首次播放以满足平台的音频策略。HTTP 服务没有预置登录和后端；微信请求需在小游戏后台配置合法域名，浏览器预览需满足后端 CORS 设置。

`game.pause()` / `game.resume()` 用于引擎生命周期，暂停时停止帧调度；场景内需要可点击的暂停弹层时，像 `PlayScene` 一样保留渲染和输入，仅暂停自己的计时与逻辑。

此基础框架尚未接入登录、分享、广告、支付、云开发和排行榜。接入时可在 `services/` 新增业务服务，并通过平台层隔离微信专用 API。
