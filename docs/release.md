# 生成与提交发布版本

源码仓库提供原生小游戏运行文件、原创音频和微信云开发登录云函数。客户端不需要 npm 依赖或构建。打包工具不会把“账号配置已填写”当成“云函数已部署”或“微信审核已完成”。

## 账号配置

在源码根目录的 `release.config.json` 填写：

```json
{
  "name": "星星收集",
  "version": "1.1.0",
  "appId": "wx开头的真实小游戏AppID",
  "cloudEnv": "你的微信云开发环境ID",
  "cloudFunctionName": "game-login"
}
```

AppID 与云开发环境 ID 是项目标识，不是密钥。AppSecret、上传私钥等机密不能写入客户端源码或发布包。

参数优先级：命令行 `--app-id` / `--cloud-env` ＞ 环境变量 `WECHAT_APP_ID` / `WECHAT_CLOUD_ENV` ＞ `release.config.json`。版本、名称和云函数名称取配置文件。打包只修改生成目录中的配置，不改源码中的游客配置。

## 本地检查与打包

需要 Node.js 18 或更新版本，先在源码仓库根目录执行：

```bash
npm run check
npm test
npm run release
```

`npm run release` 在缺少有效小游戏 AppID 或云环境 ID 时立即失败，不会生成冒充正式版本的游客包。也可临时传入项目标识：

```bash
npm run release -- --app-id wx1234567890abcdef --cloud-env your-cloud-environment
```

账号配置尚未完成时，可以生成发布候选包：

```bash
npm run release:candidate
```

候选包在缺少真实账号时使用 `touristappid`，登录暂不可用，游客流程可体验。具体配置缺失列入状态文件，不会被浏览器演示身份代替。

输出为：

```text
dist/
  seed-minigame-1.1.0/          可导入微信开发者工具的独立目录
  seed-minigame-1.1.0.zip      同内容 ZIP
```

生成包包括 `project.config.json`、`minigame/`、`cloudfunctions/`、文档，以及：

- `IMPORT.md`：该包的导入与部署步骤。
- `RELEASE_STATUS.json`：候选/配置状态、缺失配置、尚需外部完成的步骤。
- `RELEASE_MANIFEST.json`：文件尺寸与 SHA256，可用于核对交付内容。

浏览器预览、开发脚本、测试、Git 元数据、截图、私有配置和 `node_modules` 不进入发布包。脚本只替换自己以前生成的同版本目录，遇到同名的其他目录会拒绝覆盖。

再次独立检查生成目录：

```bash
node scripts/verify-release.cjs dist/seed-minigame-1.1.0
node scripts/verify-release.cjs dist/seed-minigame-1.1.0 --strict
```

检查覆盖包结构、真实配置（strict 模式）、资源引用、文件哈希以及小游戏主包体积。本项目采用 **4 MiB** 的保守体积预算；这不是对微信当前所有包类型限制的声明，实际上限应以开发者工具和微信后台提示为准。

## 微信端部署与验收

1. 解压 ZIP 后，在微信开发者工具中选择小游戏，导入包内根目录。
2. 确认 AppID 绑定的是这款小游戏，云开发环境也已关联到该账号。
3. 右键 `cloudfunctions/game-login`，选择“上传并部署：云端安装依赖”。如改过云函数名称，请使用配置中对应的文件夹名称。具体身份登录部署见 [cloud-login.md](cloud-login.md)。
4. 真机检查首次登录、取消或失败重试、退出、开始游戏、连续收集音效、背景音乐开关、切后台与回前台、游戏结算和重开。
5. 在微信后台完成主体、类目、隐私与其他当前要求的发布资料。将体验版上传后完成平台要求的测试，再按后台流程提审。

`readyForUpload: false` 表示自动化工具没有代替你完成云部署、真机验收或微信平台审核。`configurationValid: true` 只表示两个项目标识等静态配置通过检查。

本仓库不包含真实 AppID、云环境或上传私钥时，交付物是可导入的发布候选包。上传签名、体验版验证和平台审核仍需账号所有者操作。
