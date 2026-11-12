'use strict';

/** HTTP boundary. Login, tokens and backend-specific protocols belong above it. */
class Request {
  constructor(platform, { baseUrl = '', timeout = 10000 } = {}) {
    this.platform = platform;
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  get(path, data) {
    return this.request(path, { method: 'GET', data });
  }

  post(path, data) {
    return this.request(path, { method: 'POST', data });
  }

  request(path, options = {}) {
    if (typeof path !== 'string' || !path) return Promise.reject(new TypeError('Request path must be a nonempty string.'));
    const url = /^https?:\/\//i.test(path) || !this.baseUrl
      ? path
      : `${this.baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
    const requestOptions = Object.assign({}, options, {
      url,
      method: (options.method || 'GET').toUpperCase(),
      timeout: options.timeout === undefined ? this.timeout : options.timeout,
      header: Object.assign({}, options.header)
    });
    return Promise.resolve().then(() => this.platform.request(requestOptions)).then((response) => {
      if (!response || response.statusCode < 200 || response.statusCode >= 300 ||
          !Number.isFinite(response.statusCode)) {
        const error = new Error(`HTTP request failed with status ${response ? response.statusCode : 'unknown'}.`);
        error.statusCode = response && response.statusCode;
        error.data = response && response.data;
        error.response = response;
        throw error;
      }
      return response;
    });
  }
}

module.exports = Request;
