class AuthService {
  constructor(platform, { cloudEnv = '', functionName = 'game-login', timeout = 15000 } = {}) {
    this.platform = platform;
    this.cloudEnv = typeof cloudEnv === 'string' ? cloudEnv.trim() : '';
    this.functionName = typeof functionName === 'string' && functionName.trim()
      ? functionName.trim() : 'game-login';
    this.timeout = Number.isFinite(timeout) && timeout > 0 ? timeout : 15000;
    this._status = 'guest';
    this._user = null;
    this._error = null;
    this._generation = 0;
    this._pending = null;
    this._listeners = new Set();
    this._destroyed = false;
  }

  get available() {
    return !this._destroyed && this.platform.kind === 'wechat' && Boolean(this.cloudEnv) &&
      typeof this.platform.authenticate === 'function';
  }

  get status() { return this._status; }
  get user() { return this._user; }
  get error() { return this._error; }

  onChange(listener) {
    if (typeof listener !== 'function') throw new TypeError('登录状态监听器必须是函数');
    if (this._destroyed) return () => {};
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  login() {
    if (this._destroyed) return Promise.reject(this._createError('登录服务已销毁', 'AUTH_DESTROYED'));
    if (this._pending) return this._pending.promise;
    if (this._status === 'authenticated') return Promise.resolve(this._user);
    if (!this.available) {
      const error = this._createError('请在已配置云开发环境的微信小游戏中登录', 'AUTH_UNAVAILABLE');
      this._setState('error', null, error);
      return Promise.reject(error);
    }

    const generation = this._generation;
    const record = { promise: null, cancel: null, timer: null };
    const cancelled = new Promise((_resolve, reject) => {
      record.cancel = reject;
      record.timer = setTimeout(() => {
        reject(this._createError('登录超时，请检查网络后重试', 'AUTH_TIMEOUT'));
      }, this.timeout);
    });
    const source = Promise.resolve().then(() => {
      if (this._destroyed || generation !== this._generation) {
        throw this._createError('登录已取消', 'AUTH_CANCELLED');
      }
      return this.platform.authenticate({ cloudEnv: this.cloudEnv, functionName: this.functionName });
    });
    record.promise = Promise.race([source, cancelled]).then((response) => {
      if (this._destroyed || generation !== this._generation) {
        throw this._createError('登录已取消', 'AUTH_CANCELLED');
      }
      const user = response && response.user;
      if (!user || typeof user.id !== 'string' || !/^[a-f0-9]{64}$/.test(user.id) ||
          typeof user.displayName !== 'string' || !user.displayName.trim() ||
          [...user.displayName].length > 32 || !Number.isSafeInteger(response.issuedAt) ||
          response.issuedAt < 0) {
        throw this._createError('登录服务返回了无效身份，请稍后重试', 'AUTH_INVALID_RESPONSE');
      }
      const identity = Object.freeze({ id: user.id, displayName: user.displayName.trim() });
      this._setState('authenticated', identity, null);
      return identity;
    }).catch((cause) => {
      const error = cause instanceof Error ? cause :
        this._createError('登录失败，请检查网络后重试', 'AUTH_FAILED');
      if (!this._destroyed && generation === this._generation) this._setState('error', null, error);
      throw error;
    }).finally(() => {
      clearTimeout(record.timer);
      if (this._pending === record) this._pending = null;
    });
    this._pending = record;
    this._setState('loading', null, null);
    return record.promise;
  }

  logout() {
    this._generation += 1;
    const pending = this._pending;
    this._pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.cancel(this._createError('登录已取消', 'AUTH_CANCELLED'));
    }
    this._setState('guest', null, null);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.logout();
    this._listeners.clear();
  }

  _setState(status, user, error) {
    this._status = status;
    this._user = user;
    this._error = error;
    const state = Object.freeze({ status, user, error, available: this.available });
    for (const listener of [...this._listeners]) {
      try { listener(state); } catch (cause) {
        if (typeof this.platform.logError === 'function') this.platform.logError(cause);
      }
    }
  }

  _createError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }
}

module.exports = AuthService;
