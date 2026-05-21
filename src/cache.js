const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function cacheKey(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

class AudioCache {
  constructor(options) {
    this.enabled = options.enabled;
    this.dir = options.dir;
    this.maxItems = options.maxItems;
  }

  async init() {
    if (!this.enabled) return;
    await fs.mkdir(this.dir, { recursive: true });
  }

  filePath(key, format) {
    return path.join(this.dir, `${key}.${format}`);
  }

  async get(key, format) {
    if (!this.enabled) return null;

    const file = this.filePath(key, format);
    try {
      const data = await fs.readFile(file);
      await fs.utimes(file, new Date(), new Date());
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async set(key, format, buffer) {
    if (!this.enabled) return;

    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.filePath(key, format), buffer);
    await this.prune();
  }

  async prune() {
    if (!this.maxItems || this.maxItems < 1) return;

    const entries = await fs.readdir(this.dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(this.dir, entry.name);
      const stat = await fs.stat(fullPath);
      files.push({ fullPath, mtimeMs: stat.mtimeMs });
    }

    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const stale = files.slice(this.maxItems);
    await Promise.all(stale.map((file) => fs.rm(file.fullPath, { force: true })));
  }

  async stats() {
    if (!this.enabled) {
      return { enabled: false, count: 0, bytes: 0 };
    }

    await fs.mkdir(this.dir, { recursive: true });
    const entries = await fs.readdir(this.dir, { withFileTypes: true });
    let count = 0;
    let bytes = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const stat = await fs.stat(path.join(this.dir, entry.name));
      count += 1;
      bytes += stat.size;
    }

    return {
      enabled: true,
      dir: this.dir,
      count,
      bytes,
      maxItems: this.maxItems
    };
  }

  async clear() {
    if (!this.enabled) return { deleted: 0 };

    await fs.mkdir(this.dir, { recursive: true });
    const entries = await fs.readdir(this.dir, { withFileTypes: true });
    let deleted = 0;
    await Promise.all(entries.map(async (entry) => {
      if (!entry.isFile()) return;
      await fs.rm(path.join(this.dir, entry.name), { force: true });
      deleted += 1;
    }));

    return { deleted };
  }
}

module.exports = { AudioCache, cacheKey };
