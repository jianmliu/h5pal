import ajax from '../js/pal/ajax.js';
import worldService from './world-service.js';

const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

class ResourceService {
  constructor() {
    this.mkfCache = new Map();
    this.descCache = new Map();
    this.fileCache = new Map();
    this.generatedGameDataCache = new Map();
  }

  async loadMKF(...names) {
    const missing = names.filter(name => !this.mkfCache.has(name) && !ajax.MKF[name]);
    if (missing.length) {
      await ajax.loadMKF(missing);
    }
    const mkfObjects = names.map((name) => {
      const mkf = ajax.MKF[name];
      this.mkfCache.set(name, mkf);
      return mkf;
    });
    return names.length === 1 ? mkfObjects[0] : mkfObjects;
  }

  getMKF(name) {
    return this.mkfCache.get(name) || ajax.MKF[name] || null;
  }

  async loadObjectDesc(filename) {
    if (this.descCache.has(filename)) {
      return this.descCache.get(filename);
    }
    const buffer = await this.loadFiles(filename);
    const file = new Uint8Array(buffer);
    const newline = '\n'.charCodeAt(0);
    const carriageReturn = '\r'.charCodeAt(0);
    const equals = '='.charCodeAt(0);
    const entries = [];

    let start = 0;
    for (let i = 0; i < file.length; i++) {
      if (file[i] !== newline) {
        continue;
      }
      let end = i;
      if (end > start && file[end - 1] === carriageReturn) {
        end -= 1;
      }
      if (end > start) {
        entries.push(file.subarray(start, end));
      }
      start = i + 1;
    }
    if (start < file.length) {
      entries.push(file.subarray(start));
    }

    const hexPattern = /[0-9a-f]/;
    const objectDesc = entries.reduce((list, line) => {
      let eqIndex = -1;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === equals) {
          eqIndex = i;
          break;
        }
      }
      if (eqIndex <= 0) {
        return list;
      }

      let hex = '';
      for (let i = 0; i < eqIndex; i++) {
        const ch = String.fromCharCode(line[i]).toLowerCase();
        if (hexPattern.test(ch)) {
          hex += ch;
        } else if (!hex.length && (ch === ' ' || ch === '\t')) {
          continue;
        } else {
          break;
        }
      }
      if (!hex) {
        return list;
      }

      const id = parseInt(hex, 16);
      if (Number.isNaN(id)) {
        return list;
      }

      const desc = line.subarray(eqIndex + 1);
      list.push({ id, desc });
      return list;
    }, []);

    this.descCache.set(filename, objectDesc);
    worldService.setObjectDescTable(objectDesc);
    return objectDesc;
  }

  async loadGeneratedGameData(path = 'game-data.json') {
    if (this.generatedGameDataCache.has(path)) {
      return this.generatedGameDataCache.get(path);
    }
    let buffer;
    try {
      buffer = await this.loadFiles(path);
    } catch (error) {
      return null;
    }
    if (!buffer) {
      return null;
    }
    try {
      const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      let jsonString = '';
      if (textDecoder) {
        jsonString = textDecoder.decode(view);
      } else {
        for (let i = 0; i < view.length; i++) {
          jsonString += String.fromCharCode(view[i]);
        }
      }
      const payload = JSON.parse(jsonString);
      this.generatedGameDataCache.set(path, payload);
      return payload;
    } catch (error) {
      console.warn('Failed to parse generated game data', error);
      return null;
    }
  }

  async loadFiles(...paths) {
    const missing = paths.filter(path => !this.fileCache.has(path));
    if (missing.length) {
      const results = await ajax.load(missing);
      missing.forEach((path, idx) => {
        this.fileCache.set(path, results[idx]);
      });
    }
    const files = paths.map(path => this.fileCache.get(path));
    return paths.length === 1 ? files[0] : files;
  }

  getFile(path) {
    return this.fileCache.get(path) || null;
  }

  clearCaches() {
    this.mkfCache.clear();
    this.descCache.clear();
    this.fileCache.clear();
    this.generatedGameDataCache.clear();
  }
}

const resourceService = new ResourceService();

export { ResourceService };
export default resourceService;
