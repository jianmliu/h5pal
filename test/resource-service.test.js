import { beforeEach, describe, expect, it, vi } from 'vitest';

const mkfStore = {};
const fileBuffers = new Map();
const encoder = new TextEncoder();

vi.mock('../src/js/pal/ajax.js', () => {
  const ensureArray = (value, args) => (Array.isArray(value) ? value : Array.from(args));

  const loadMKF = vi.fn(async function(names) {
    const list = ensureArray(names, arguments);
    return list.map((name) => {
      const data = { name };
      mkfStore[name] = data;
      return data;
    });
  });

  const load = vi.fn(async function(paths) {
    const list = ensureArray(paths, arguments);
    return list.map((path) => {
      if (!fileBuffers.has(path)) {
        if (path === 'desc.dat') {
          const content = encoder.encode('0001=DESC_LINE\n0002=SECOND*LINE');
          fileBuffers.set(path, content.buffer);
        } else {
          fileBuffers.set(path, new ArrayBuffer(0));
        }
      }
      return fileBuffers.get(path);
    });
  });

  return {
    default: {
      loadMKF,
      load,
      MKF: mkfStore
    }
  };
});

vi.mock('../src/services/state-service.js', () => ({
  default: {
    setGlobal: vi.fn(),
    getGlobal: vi.fn()
  }
}));

describe('ResourceService', () => {
  let ResourceService;
  let service;

  beforeEach(async () => {
    for (const key of Object.keys(mkfStore)) {
      delete mkfStore[key];
    }
    fileBuffers.clear();
    const module = await import('../src/services/resource-service.js');
    ResourceService = module.ResourceService;
    service = new ResourceService();
  });

  it('caches MKF loads', async () => {
    const first = await service.loadMKF('DATA');
    const second = await service.loadMKF('DATA');
    expect(first).toBe(second);
    expect(service.getMKF('DATA')).toBe(first);
  });

  it('loads object descriptions and caches them', async () => {
    const first = await service.loadObjectDesc('desc.dat');
    const second = await service.loadObjectDesc('desc.dat');
    expect(first).toBe(second);
    expect(first).toHaveLength(2);
    expect(first[0].id).toBe(0x0001);
    expect(Array.from(first[0].desc)).toEqual(Array.from(encoder.encode('DESC_LINE')));
  });

  it('loads binary files and caches them', async () => {
    const first = await service.loadFiles('m.msg');
    const second = await service.loadFiles('m.msg');
    expect(first).toBe(second);
  });
});
