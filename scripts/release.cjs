'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyRelease, listFiles, validAppId, GENERATED_BY } = require('./verify-release.cjs');

function resolveConfig(root, options = {}, env = process.env) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'release.config.json'), 'utf8'));
  const resolved = {
    name: config.name,
    version: config.version,
    appId: options.appId !== undefined ? options.appId : (env.WECHAT_APP_ID !== undefined ? env.WECHAT_APP_ID : config.appId),
    cloudEnv: options.cloudEnv !== undefined ? options.cloudEnv : (env.WECHAT_CLOUD_ENV !== undefined ? env.WECHAT_CLOUD_ENV : config.cloudEnv),
    cloudFunctionName: config.cloudFunctionName,
  };
  for (const field of ['name', 'version', 'appId', 'cloudEnv', 'cloudFunctionName']) {
    if (typeof resolved[field] !== 'string') throw new Error(`release.config.${field} 必须是字符串`);
    resolved[field] = resolved[field].trim();
  }
  if (!resolved.name || resolved.name.length > 50 || /[\/\\:\x00-\x1f]/.test(resolved.name) || resolved.name.includes('..')) {
    throw new Error('发布名称 name 无效');
  }
  if (resolved.version.length > 64 || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*)?$/.test(resolved.version)) {
    throw new Error('发布版本 version 必须是安全的语义版本，例如 1.1.0');
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(resolved.cloudFunctionName)) throw new Error('云函数名称 cloudFunctionName 无效');
  if (resolved.cloudEnv && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(resolved.cloudEnv)) throw new Error('云环境 cloudEnv 格式无效');
  if (!resolved.appId) resolved.appId = 'touristappid';
  if (resolved.appId !== 'touristappid' && !validAppId(resolved.appId)) throw new Error('AppID 格式无效，必须是 wx 开头的 16 位十六进制非零账号 ID');
  return resolved;
}

function excluded(name) {
  return ['node_modules', '.git', 'tests', 'scripts', 'preview', 'artifacts', '.DS_Store', 'project.private.config.json'].includes(name) ||
    name === '.env' || name.startsWith('.env.') || /\.(?:log|zip|pem|key|p12)$/.test(name);
}

function copyTree(source, destination) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`发布源不允许符号链接：${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source).sort()) {
      if (!excluded(name)) copyTree(path.join(source, name), path.join(destination, name));
    }
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  } else throw new Error(`不支持的发布源文件：${source}`);
}

const crcTable = Array.from({ length: 256 }, (_, initial) => {
  let value = initial;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDirectory(directory, prefix) {
  const files = listFiles(directory);
  if (files.length > 65535) throw new Error('ZIP 文件数超出支持范围');
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const relative of files) {
    const filename = Buffer.from(`${prefix}/${relative}`, 'utf8');
    const data = fs.readFileSync(path.join(directory, relative));
    if (filename.length > 65535 || data.length > 0xffffffff) throw new Error('ZIP 文件大小超出支持范围');
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(20513, 12); // 固定为 2020-01-01，使相同输入的 ZIP 可复现。
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(20513, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    localParts.push(header, filename, data);
    centralParts.push(central, filename);
    offset += header.length + filename.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  if (offset + central.length > 0xffffffff) throw new Error('ZIP 总大小超出支持范围');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

function writeJson(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function assertOwnedOutput(directory, zipPath) {
  if (fs.existsSync(directory)) {
    const stat = fs.lstatSync(directory);
    let status;
    try { status = JSON.parse(fs.readFileSync(path.join(directory, 'RELEASE_STATUS.json'), 'utf8')); } catch (_) {}
    if (!stat.isDirectory() || stat.isSymbolicLink() || !status || status.generatedBy !== GENERATED_BY) {
      throw new Error(`拒绝覆盖非本工具生成的目录：${directory}`);
    }
  } else if (fs.existsSync(zipPath)) throw new Error(`拒绝覆盖缺少对应生成目录的 ZIP：${zipPath}`);
  if (fs.existsSync(zipPath) && (!fs.lstatSync(zipPath).isFile() || fs.lstatSync(zipPath).isSymbolicLink())) {
    throw new Error(`拒绝覆盖非普通 ZIP 文件：${zipPath}`);
  }
}

function buildRelease({ root, candidate = false, options = {}, env = process.env, outDir } = {}) {
  root = path.resolve(root || path.join(__dirname, '..'));
  const config = resolveConfig(root, options, env);
  const blockers = [];
  if (!validAppId(config.appId)) blockers.push('缺少真实小游戏 AppID（appId）');
  if (!config.cloudEnv) blockers.push('缺少微信云开发环境 ID（cloudEnv）');
  if (!candidate && blockers.length) throw new Error(`无法生成已配置发布包：${blockers.join('；')}`);
  const outputRoot = path.resolve(outDir || path.join(root, 'dist'));
  const basename = `seed-minigame-${config.version}`;
  const directory = path.join(outputRoot, basename);
  const zipPath = `${directory}.zip`;
  assertOwnedOutput(directory, zipPath);
  fs.mkdirSync(outputRoot, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(outputRoot, '.seed-minigame-build-'));
  const temporaryZip = `${temporary}.zip`;
  const backup = `${temporary}.previous`;
  let previousMoved = false;
  let currentMoved = false;
  try {
    for (const name of ['minigame', 'cloudfunctions']) copyTree(path.join(root, name), path.join(temporary, name));
    const configuredFunction = path.join(temporary, 'cloudfunctions', config.cloudFunctionName);
    const defaultFunction = path.join(temporary, 'cloudfunctions', 'game-login');
    if (config.cloudFunctionName !== 'game-login' && !fs.existsSync(configuredFunction) && fs.existsSync(defaultFunction)) {
      fs.renameSync(defaultFunction, configuredFunction);
    }
    for (const name of ['README.md', 'docs']) {
      if (fs.existsSync(path.join(root, name))) copyTree(path.join(root, name), path.join(temporary, name));
    }
    const sourceProject = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
    writeJson(path.join(temporary, 'project.config.json'), {
      ...sourceProject,
      projectname: `seed-minigame-${config.version}`,
      appid: config.appId,
      compileType: 'game',
      miniprogramRoot: 'minigame/',
      cloudfunctionRoot: 'cloudfunctions/',
      setting: { ...sourceProject.setting, es6: true, minified: true, urlCheck: true },
    });
    const runtime = { ...config };
    fs.mkdirSync(path.join(temporary, 'minigame/src/config'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'minigame/src/config/release.js'), `// 由发布工具生成；AppID 与环境 ID 不是密钥。\nmodule.exports = ${JSON.stringify(runtime, null, 2)};\n`);
    const status = {
      generatedBy: GENERATED_BY,
      name: config.name,
      version: config.version,
      appId: config.appId,
      cloudEnv: config.cloudEnv,
      candidate: Boolean(candidate),
      releaseState: candidate ? 'candidate' : 'configured',
      configurationValid: blockers.length === 0,
      readyForUpload: false,
      blockers,
      requiredExternalSteps: [
        '在指定微信云开发环境部署 game-login 云函数，并确认可信微信身份登录成功。',
        '在微信开发者工具编译，并在真机完成音频、隐私说明、登录及前后台验收。',
        '在小游戏后台完成主体、类目、隐私和平台要求的发布资料，上传体验版并按平台流程提审。',
      ],
    };
    status.requiredExternalSteps[0] = `在指定微信云开发环境部署 ${config.cloudFunctionName} 云函数，并确认可信微信身份登录成功。`;
    writeJson(path.join(temporary, 'RELEASE_STATUS.json'), status);
    fs.writeFileSync(path.join(temporary, 'IMPORT.md'), `# ${config.name} ${config.version}\n\n此包状态：${candidate ? '发布候选包' : '已填写账号配置的发布包'}，尚未部署或提交微信审核。\n\n1. 微信开发者工具选择小游戏，导入本目录的 project.config.json。\n2. ${blockers.length ? '先填写真实 AppID 与云环境 ID，再从源码重新生成正式配置包。' : '确认 AppID 与云环境均属于你的小程序账号。'}\n3. 右键 cloudfunctions/${config.cloudFunctionName}，上传并部署：云端安装依赖。\n4. 检查 docs/release.md 与 RELEASE_STATUS.json，完成真机验证后上传提审。\n\n微信端无需在本包根目录执行 npm 安装或构建；云函数依赖通过云端安装。\n源码开发脚本在 GitHub 源码仓库中，本包仅保留运行及部署文件。\n`);
    const verification = verifyRelease(temporary, { strict: !candidate });
    if (verification.errors.length) throw new Error(`发布包检查失败：\n${verification.errors.join('\n')}`);
    const manifest = {
      generatedBy: GENERATED_BY,
      version: config.version,
      mainPackageBytes: verification.mainPackageBytes,
      files: verification.files.map((relative) => {
        const content = fs.readFileSync(path.join(temporary, relative));
        return { path: relative, size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') };
      }),
    };
    writeJson(path.join(temporary, 'RELEASE_MANIFEST.json'), manifest);
    const finalVerification = verifyRelease(temporary, { strict: !candidate });
    if (finalVerification.errors.length) throw new Error(finalVerification.errors.join('\n'));
    fs.writeFileSync(temporaryZip, zipDirectory(temporary, basename), { flag: 'wx' });
    // 先完成检查及 ZIP，再替换本工具以前生成的同版本目录。
    if (fs.existsSync(directory)) { fs.renameSync(directory, backup); previousMoved = true; }
    fs.renameSync(temporary, directory);
    currentMoved = true;
    fs.renameSync(temporaryZip, zipPath);
    if (previousMoved) fs.rmSync(backup, { recursive: true, force: true });
    return { directory, zipPath, status, manifest };
  } catch (error) {
    if (currentMoved) fs.rmSync(directory, { recursive: true, force: true });
    if (previousMoved && fs.existsSync(backup)) fs.renameSync(backup, directory);
    throw error;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
    fs.rmSync(temporaryZip, { force: true });
  }
}

function parseArguments(args) {
  const options = {};
  let candidate = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--candidate') candidate = true;
    else if (arg === '--app-id' || arg === '--cloud-env') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} 需要提供值`);
      options[arg === '--app-id' ? 'appId' : 'cloudEnv'] = value;
    } else throw new Error(`未知参数：${arg}`);
  }
  return { candidate, options };
}

if (require.main === module) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const result = buildRelease({ root: path.join(__dirname, '..'), ...args });
    console.log(`${result.status.candidate ? '发布候选包' : '已配置发布包'}已生成：${result.directory}`);
    console.log(`ZIP：${result.zipPath}`);
    console.log(`小游戏主包：${result.manifest.mainPackageBytes} 字节；SHA256 文件清单：RELEASE_MANIFEST.json`);
    for (const blocker of result.status.blockers) console.log(`待配置：${blocker}`);
    console.log('云函数部署、真机验收与微信审核尚未完成，详见 RELEASE_STATUS.json。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { buildRelease, resolveConfig };
