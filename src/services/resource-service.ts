import ajax from '../js/pal/ajax.js';
import worldService from './world-service';

const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

type MkfEntry = ArrayBuffer | Uint8Array | Record<string, unknown> | null | undefined;
type MkfMap = Map<string, MkfEntry>;
type FileEntry = ArrayBuffer | Uint8Array | null | undefined;
type FileCache = Map<string, FileEntry>;
type DescEntry = { id: number; desc: Uint8Array };
type DescCache = Map<string, DescEntry[]>;
type GameDataPayload = {
  eventObjects?: unknown;
  scenes?: unknown;
  objects?: unknown;
  playerRoles?: unknown;
  [key: string]: unknown;
} | null;

type AjaxModule = {
  MKF: Record<string, MkfEntry>;
  loadMKF: (names: string[]) => Promise<unknown>;
  load: (paths: string[]) => Promise<(ArrayBuffer | Uint8Array | null | undefined)[]>;
};

class ResourceService {
  mkfCache: MkfMap;
  descCache: DescCache;
  fileCache: FileCache;
  generatedGameDataCache: Map<string, GameDataPayload>;
  _gameModulePromise: Promise<{ saveGame?: (slot: number) => Promise<boolean> | boolean }> | null;

  constructor() {
    this.mkfCache = new Map();
    this.descCache = new Map();
    this.fileCache = new Map();
    this.generatedGameDataCache = new Map();
    this._gameModulePromise = null;
  }

  async loadMKF(...names: string[]): Promise<MkfEntry | MkfEntry[]> {
    const palAjax = ajax as unknown as AjaxModule;
    const missing = names.filter(name => !this.mkfCache.has(name) && !palAjax.MKF[name]);
    if (missing.length) {
      await palAjax.loadMKF(missing);
    }
    const mkfObjects = names.map((name) => {
      const mkf = palAjax.MKF[name];
      this.mkfCache.set(name, mkf);
      return mkf;
    });
    return names.length === 1 ? mkfObjects[0] : mkfObjects;
  }

  getMKF(name: string): MkfEntry | null {
    const palAjax = ajax as unknown as AjaxModule;
    return this.mkfCache.get(name) || palAjax.MKF[name] || null;
  }

  async loadObjectDesc(filename: string): Promise<DescEntry[] | null> {
    if (this.descCache.has(filename)) {
      return this.descCache.get(filename) || null;
    }
    const buffer = await this.loadFiles(filename);
    const file = new Uint8Array(buffer as ArrayBufferLike);
    const newline = '\n'.charCodeAt(0);
    const carriageReturn = '\r'.charCodeAt(0);
    const equals = '='.charCodeAt(0);
    const entries: Uint8Array[] = [];

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
    const objectDesc = entries.reduce<Array<DescEntry>>((list, line) => {
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
    if (worldService && typeof worldService.setObjectDescTable === 'function') {
      worldService.setObjectDescTable(objectDesc);
    }
    return objectDesc;
  }

  async loadGeneratedGameData(path = 'game-data.json'): Promise<GameDataPayload> {
    if (this.generatedGameDataCache.has(path)) {
      return this.generatedGameDataCache.get(path) ?? null;
    }
    let buffer: ArrayBuffer | Uint8Array | null | undefined;
    try {
      buffer = await this.loadFiles(path) as ArrayBuffer | Uint8Array;
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
      const payload = JSON.parse(jsonString) as GameDataPayload;
      this.generatedGameDataCache.set(path, payload);
      return payload;
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Failed to parse generated game data', error);
      }
      return null;
    }
  }

  async loadFiles(...paths: string[]): Promise<FileEntry | FileEntry[]> {
    const palAjax = ajax as unknown as AjaxModule;
    const missing = paths.filter(path => !this.fileCache.has(path));
    if (missing.length) {
      const results = await palAjax.load(missing);
      missing.forEach((path, idx) => {
        this.fileCache.set(path, results[idx]);
      });
    }
    const files = paths.map(path => this.fileCache.get(path));
    return paths.length === 1 ? files[0] : files;
  }

  getFile(path: string): FileEntry | null {
    return this.fileCache.get(path) || null;
  }

  clearCaches() {
    this.mkfCache.clear();
    this.descCache.clear();
    this.fileCache.clear();
    this.generatedGameDataCache.clear();
  }

  async _resolveGameModule(): Promise<{ saveGame?: (slot: number) => Promise<boolean> | boolean }> {
    if (this._gameModulePromise) {
      return this._gameModulePromise;
    }
    const loader = import('../js/pal/game.js')
      .then((mod) => {
        if (mod && typeof (mod as { saveGame?: unknown }).saveGame === 'function') {
          return mod as { saveGame?: (slot: number) => Promise<boolean> | boolean };
        }
        if (mod && (mod as any).default && typeof (mod as any).default.saveGame === 'function') {
          return (mod as any).default as { saveGame?: (slot: number) => Promise<boolean> | boolean };
        }
        return mod as any;
      })
      .catch((err) => {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[resource-service] failed to load game module for saveGame', err);
        }
        throw err;
      });
    this._gameModulePromise = loader;
    return loader;
  }

  async saveGame(slot: number): Promise<boolean> {
    try {
      const gameModule = await this._resolveGameModule();
      if (!gameModule || typeof gameModule.saveGame !== 'function') {
        throw new Error('game module missing saveGame');
      }
      return gameModule.saveGame(slot);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[resource-service] saveGame failed', err);
      }
      return false;
    }
  }
}

const resourceService = new ResourceService();

export { ResourceService };
export default resourceService;
