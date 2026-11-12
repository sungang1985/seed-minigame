'use strict';

/** Small, namespaced wrapper around the platform's local storage. */
class Storage {
  constructor(platform, namespace = 'wx-mini-starter') {
    this.platform = platform;
    this.namespace = namespace;
  }

  get(key, fallback = null) {
    try {
      const value = this.platform.getStorage(this._key(key));
      return value === undefined || value === null ? fallback : value;
    } catch (error) {
      this._report(error);
      return fallback;
    }
  }

  set(key, value) {
    try {
      this.platform.setStorage(this._key(key), value);
      return true;
    } catch (error) {
      this._report(error);
      return false;
    }
  }

  remove(key) {
    try {
      this.platform.removeStorage(this._key(key));
      return true;
    } catch (error) {
      this._report(error);
      return false;
    }
  }

  _key(key) {
    return `${this.namespace}:${key}`;
  }

  _report(error) {
    if (typeof this.platform.logError === 'function') this.platform.logError(error);
  }
}

module.exports = Storage;
