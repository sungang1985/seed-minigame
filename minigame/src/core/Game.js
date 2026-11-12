const EventBus = require('./EventBus');
const SceneManager = require('./SceneManager');
const Storage = require('../services/Storage');
const ResourceManager = require('../services/ResourceManager');
const AudioManager = require('../services/AudioManager');
const Request = require('../services/Request');

class Game {
  constructor(platform, config) {
    this.platform = platform;
    this.config = config;
    this.canvas = platform.canvas;
    this.context = this.canvas.getContext('2d');
    if (!this.context) throw new Error('无法创建 Canvas 2D 上下文');
    this.events = new EventBus();
    this.scenes = new SceneManager(this);
    this.storage = new Storage(platform, config.storageNamespace);
    this.resources = new ResourceManager(platform);
    this.audio = new AudioManager(platform, this.storage);
    this.request = new Request(platform);
    this.debug = config.debug;
    this.stats = { fps: 0 };
    this.width = config.designWidth;
    this.height = 812;
    this.safeArea = { top: 0, bottom: 0, left: 0, right: 0 };
    this.scale = 1;
    this.running = false;
    this.paused = false;
    this.destroyed = false;
    this.frame = null;
    this.lastTime = null;
    this.subscriptions = [];
    this.loading = 0;
    this.ready = false;
    this.error = null;
    this.tick = this.tick.bind(this);
  }

  async start(initialScene = 'menu') {
    if (this.destroyed) throw new Error('Game 已销毁，请创建新实例');
    if (this.running) return;
    this.resize();
    this.running = true;
    this.subscriptions.push(
      this.platform.onResize(() => this.resize()),
      this.platform.onPointer((event) => {
        if (!this.paused && this.ready && !this.error) {
          this.scenes.onPointer({ ...event, x: event.x / this.scale, y: event.y / this.scale });
        }
      }),
      this.platform.onHide(() => this.pause()),
      this.platform.onShow(() => this.resume()),
    );
    this.scheduleFrame();
    try {
      await this.resources.load(this.config.assets, (completed, total) => {
        this.loading = total ? completed / total : 1;
      });
      if (this.destroyed) return;
      this.scenes.change(initialScene);
      this.ready = true;
      this.events.emit('game:ready');
    } catch (error) {
      if (this.destroyed) return;
      this.error = error;
      throw error;
    }
  }

  resize() {
    const info = this.platform.getWindowInfo();
    const width = Math.max(1, info.windowWidth);
    const height = Math.max(1, info.windowHeight);
    this.scale = width / this.width;
    this.height = height / this.scale;
    this.pixelRatio = Math.min(this.config.maxPixelRatio, Math.max(1, info.pixelRatio || 1));
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    const safe = info.safeArea || { top: 0, left: 0, right: width, bottom: height };
    this.safeArea = {
      top: Math.max(0, safe.top || 0, info.menuBottom ? info.menuBottom + 8 : 0) / this.scale,
      left: Math.max(0, safe.left || 0) / this.scale,
      right: Math.max(0, width - (safe.right === undefined ? width : safe.right)) / this.scale,
      bottom: Math.max(0, height - (safe.bottom === undefined ? height : safe.bottom)) / this.scale,
    };
    this.events.emit('game:resize', { width: this.width, height: this.height, safeArea: this.safeArea });
    if (this.paused) this.render();
  }

  scheduleFrame() {
    if (this.running && !this.paused && this.frame === null) {
      this.frame = this.platform.requestFrame(this.tick);
    }
  }

  tick() {
    this.frame = null;
    if (!this.running || this.paused) return;
    const now = this.platform.now();
    const elapsed = this.lastTime === null ? 0 : Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const deltaTime = Math.min(elapsed, this.config.maxDeltaTime);
    if (elapsed > 0) this.stats.fps = Math.round(1 / elapsed);
    try {
      if (this.ready && !this.error) this.scenes.update(deltaTime);
      this.render();
    } catch (error) {
      this.error = error;
      this.platform.logError(error);
      this.render();
    }
    this.scheduleFrame();
  }

  render() {
    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const scale = this.scale * this.pixelRatio;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.save();
    try {
      if (this.error || !this.ready) {
        context.fillStyle = '#101c2c';
        context.fillRect(0, 0, this.width, this.height);
        context.fillStyle = '#dce8ef';
        context.font = '16px sans-serif';
        context.textAlign = 'center';
        context.fillText(this.error ? '加载失败，请重新进入游戏' : `资源加载中 ${Math.round(this.loading * 100)}%`, this.width / 2, this.height / 2);
      } else {
        this.scenes.render(context);
      }
      if (this.debug) {
        context.textAlign = 'left';
        context.font = '12px monospace';
        context.fillStyle = '#8fffd9';
        context.fillText(`FPS ${this.stats.fps} | ${this.scenes.name}`, 12, this.height - this.safeArea.bottom - 6);
      }
    } finally { context.restore(); }
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.lastTime = null;
    if (this.frame !== null) this.platform.cancelFrame(this.frame);
    this.frame = null;
    this.audio.pauseAll();
    this.events.emit('game:pause');
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.lastTime = null;
    this.audio.resumeAll();
    this.events.emit('game:resume');
    this.scheduleFrame();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.running = false;
    if (this.frame !== null) this.platform.cancelFrame(this.frame);
    this.frame = null;
    this.subscriptions.splice(0).forEach((unsubscribe) => unsubscribe());
    this.scenes.clear();
    this.audio.destroy();
    this.resources.clear();
    this.events.clear();
  }
}

module.exports = Game;
