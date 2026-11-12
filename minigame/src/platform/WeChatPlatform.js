class WeChatPlatform {
  constructor(api) {
    this.api = api;
    // 第一次 createCanvas 创建的即小游戏上屏 Canvas。
    this.canvas = api.createCanvas();
    this.kind = 'wechat';
  }

  getWindowInfo() {
    const info = this.api.getWindowInfo
      ? this.api.getWindowInfo()
      : this.api.getSystemInfoSync();
    let menuBottom = 0;
    if (this.api.getMenuButtonBoundingClientRect) {
      try { menuBottom = this.api.getMenuButtonBoundingClientRect().bottom || 0; } catch (_) {}
    }
    return { ...info, menuBottom };
  }

  onResize(callback) {
    const listener = () => callback();
    if (this.api.onWindowResize) this.api.onWindowResize(listener);
    return () => {
      if (this.api.offWindowResize) this.api.offWindowResize(listener);
    };
  }

  onPointer(callback) {
    const types = [
      ['TouchStart', 'down'], ['TouchMove', 'move'],
      ['TouchEnd', 'up'], ['TouchCancel', 'cancel'],
    ];
    const disposers = types.map(([name, type]) => {
      const listener = (event) => {
        const touches = event.changedTouches || event.touches || [];
        touches.forEach((touch) => callback({
          type,
          x: touch.clientX === undefined ? touch.pageX : touch.clientX,
          y: touch.clientY === undefined ? touch.pageY : touch.clientY,
          id: touch.identifier,
        }));
      };
      this.api[`on${name}`](listener);
      return () => {
        if (this.api[`off${name}`]) this.api[`off${name}`](listener);
      };
    });
    return () => disposers.forEach((dispose) => dispose());
  }

  onShow(callback) {
    this.api.onShow(callback);
    return () => { if (this.api.offShow) this.api.offShow(callback); };
  }

  onHide(callback) {
    this.api.onHide(callback);
    return () => { if (this.api.offHide) this.api.offHide(callback); };
  }

  requestFrame(callback) { return requestAnimationFrame(callback); }
  cancelFrame(handle) { cancelAnimationFrame(handle); }
  now() { return Date.now(); }
  createImage() { return this.api.createImage(); }
  createAudio() {
    const context = this.api.createInnerAudioContext();
    context.obeyMuteSwitch = true;
    return context;
  }

  async authenticate({ cloudEnv, functionName }) {
    if (!cloudEnv || !this.api.cloud || typeof this.api.cloud.callFunction !== 'function') {
      throw new Error('微信云登录当前不可用');
    }
    if (this.cloudEnvironment !== cloudEnv) {
      this.api.cloud.init({ env: cloudEnv, traceUser: false });
      this.cloudEnvironment = cloudEnv;
    }
    // 云调用携带可信微信身份，由云函数 getWXContext 校验；无需客户端保存 token。
    const response = await this.api.cloud.callFunction({
      name: functionName,
      data: {},
      config: { env: cloudEnv },
    });
    return response.result;
  }

  shareData() {
    return { title: '30 秒收集星光，你能拿多少分？', imageUrl: 'assets/share.png' };
  }

  enableShare() {
    if (this.api.showShareMenu) this.api.showShareMenu({ menus: ['shareAppMessage'] });
    const handler = () => this.shareData();
    if (this.api.onShareAppMessage) this.api.onShareAppMessage(handler);
    return () => { if (this.api.offShareAppMessage) this.api.offShareAppMessage(handler); };
  }

  share() {
    if (!this.api.shareAppMessage) return Promise.reject(new Error('当前版本不支持分享'));
    this.api.shareAppMessage(this.shareData());
    return Promise.resolve();
  }
  getStorage(key) {
    const value = this.api.getStorageSync(key);
    // 微信对不存在的 key 返回空串，统一成与浏览器相同的缺省值。
    if (value === '' && !this.api.getStorageInfoSync().keys.includes(key)) return undefined;
    return value;
  }
  setStorage(key, value) { this.api.setStorageSync(key, value); }
  removeStorage(key) { this.api.removeStorageSync(key); }
  logError(error) { console.warn('[Platform]', error); }

  request(options) {
    return new Promise((resolve, reject) => {
      this.api.request({ ...options, success: resolve, fail: reject });
    });
  }
}

module.exports = WeChatPlatform;
