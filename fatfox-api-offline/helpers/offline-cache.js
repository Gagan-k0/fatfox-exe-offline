'use strict';

/**
 * Drop-in Redis replacement for the single-user offline EXE.
 * Implements the ioredis surface the API actually uses: get/set/setex/del/exists/keys/flushall/on.
 */

class OfflineCache {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
  }

  _expired(key) {
    if (this.ttls.has(key) && Date.now() > this.ttls.get(key)) {
      this.store.delete(key);
      this.ttls.delete(key);
      return true;
    }
    return false;
  }

  async get(key) {
    if (this._expired(key)) return null;
    const value = this.store.get(key);
    return value === undefined ? null : value;
  }

  async set(key, value, ...args) {
    this.store.set(key, value);
    const exIdx = args.findIndex((a) => a === 'EX' || a === 'ex');
    if (exIdx !== -1 && args[exIdx + 1]) {
      this.ttls.set(key, Date.now() + (Number(args[exIdx + 1]) * 1000));
    }
    const pxIdx = args.findIndex((a) => a === 'PX' || a === 'px');
    if (pxIdx !== -1 && args[pxIdx + 1]) {
      this.ttls.set(key, Date.now() + Number(args[pxIdx + 1]));
    }
    return 'OK';
  }

  async setex(key, seconds, value) {
    return this.set(key, value, 'EX', seconds);
  }

  async setnx(key, value) {
    if (this.store.has(key) && !this._expired(key)) return 0;
    await this.set(key, value);
    return 1;
  }

  async del(key) {
    const keys = Array.isArray(key) ? key : [key];
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k)) n += 1;
      this.ttls.delete(k);
    }
    return n;
  }

  async exists(key) {
    if (this._expired(key)) return 0;
    return this.store.has(key) ? 1 : 0;
  }

  async expire(key, seconds) {
    if (!this.store.has(key)) return 0;
    this.ttls.set(key, Date.now() + (Number(seconds) * 1000));
    return 1;
  }

  async ttl(key) {
    if (!this.store.has(key)) return -2;
    if (!this.ttls.has(key)) return -1;
    return Math.max(0, Math.ceil((this.ttls.get(key) - Date.now()) / 1000));
  }

  async incr(key) {
    const next = (Number(await this.get(key)) || 0) + 1;
    await this.set(key, String(next));
    return next;
  }

  async incrby(key, amount) {
    const next = (Number(await this.get(key)) || 0) + Number(amount);
    await this.set(key, String(next));
    return next;
  }

  async keys(pattern) {
    const re = new RegExp('^' + String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const out = [];
    for (const key of this.store.keys()) {
      if (this._expired(key)) continue;
      if (re.test(key)) out.push(key);
    }
    return out;
  }

  async flushall() {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  async ping() { return 'PONG'; }
  async quit() { return 'OK'; }
  async disconnect() { return 'OK'; }
  on() { return this; }
  once() { return this; }
  off() { return this; }
  status = 'ready';
}

module.exports = new OfflineCache();
module.exports.OfflineCache = OfflineCache;
