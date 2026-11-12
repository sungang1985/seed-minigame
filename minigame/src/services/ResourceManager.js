'use strict';

/** Image cache with shared in-flight loads and explicit failure propagation. */
class ResourceManager {
  constructor(platform) {
    this.platform = platform;
    this.cache = new Map();
    this.pending = new Map();
    this.generation = 0;
  }

  loadImage(key, src) {
    if (typeof key !== 'string' || !key || typeof src !== 'string' || !src) {
      return Promise.reject(new TypeError('Image resources require a nonempty key and src.'));
    }

    const existing = this.cache.get(key) || this.pending.get(key);
    if (existing) {
      if (existing.src !== src) {
        return Promise.reject(new Error(`Resource key "${key}" is already bound to another source.`));
      }
      return existing.promise || Promise.resolve(existing.image);
    }

    const generation = this.generation;
    const record = { src, promise: null };
    // Defer image creation so the record exists even if a platform loads synchronously.
    record.promise = Promise.resolve().then(() => new Promise((resolve, reject) => {
      let image;
      const cleanup = () => {
        if (image) {
          image.onload = null;
          image.onerror = null;
        }
        if (this.pending.get(key) === record) this.pending.delete(key);
      };

      try {
        image = this.platform.createImage();
        image.onload = () => {
          cleanup();
          if (this.generation === generation) this.cache.set(key, { src, image });
          resolve(image);
        };
        image.onerror = (cause) => {
          cleanup();
          const error = new Error(`Failed to load image "${key}" (${src}).`);
          error.cause = cause;
          reject(error);
        };
        image.src = src;
      } catch (error) {
        cleanup();
        reject(error);
      }
    }));
    this.pending.set(key, record);
    return record.promise;
  }

  load(manifest, onProgress) {
    if (!Array.isArray(manifest)) return Promise.reject(new TypeError('Resource manifest must be an array.'));
    const sources = new Map();
    for (const entry of manifest) {
      if (!entry || entry.type !== 'image' || typeof entry.key !== 'string' || !entry.key ||
          typeof entry.src !== 'string' || !entry.src) {
        return Promise.reject(new TypeError('Resource manifest entries require { key, type: "image", src }.'));
      }
      if (sources.has(entry.key) && sources.get(entry.key) !== entry.src) {
        return Promise.reject(new Error(`Conflicting sources for resource "${entry.key}".`));
      }
      sources.set(entry.key, entry.src);
    }

    let completed = 0;
    const output = Object.create(null);
    if (manifest.length === 0 && typeof onProgress === 'function') onProgress(0, 0, null);
    return Promise.all(manifest.map((entry) => this.loadImage(entry.key, entry.src).then((image) => {
      output[entry.key] = image;
      completed += 1;
      if (typeof onProgress === 'function') onProgress(completed, manifest.length, entry);
    }))).then(() => output);
  }

  get(key) {
    const resource = this.cache.get(key);
    return resource ? resource.image : undefined;
  }

  clear() {
    // Old callers may still finish, but cannot repopulate this generation's cache.
    this.generation += 1;
    this.cache.clear();
    this.pending.clear();
  }
}

module.exports = ResourceManager;
