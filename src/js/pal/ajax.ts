import traceModuleLoad from './util-trace';
import utils from './utils';
import MKF from './mkf';
import co from './co';
import config from './config';

traceModuleLoad('ajax module load');

type MkfCache = Record<string, unknown>;
type FileCache = Record<string, Uint8Array>;

const ajax: any = {
  cache: {} as FileCache,
  MKF: {} as MkfCache
};

utils.extend(ajax, utils.Events);

ajax.requestBinary = function(filePath: string, targetUrl: string | null, callback: (data: Uint8Array | null) => void) {
  targetUrl = targetUrl || filePath;
  // if (targetUrl.indexOf('?') === -1) {
  //   targetUrl += '?v=' + Math.random();
  // }
  const cfg: any = config;
  if (cfg.useModAssets && typeof fetch === 'function') {
    fetch(targetUrl, { cache: 'no-store' })
      .then((response) => response.ok ? response.arrayBuffer() : null)
      .then((arrayBuffer) => arrayBuffer ? new Uint8Array(arrayBuffer) : null)
      .then(callback)
      .catch(() => callback(null));
    return;
  }
  var xhr = new XMLHttpRequest();
  xhr.open('GET', targetUrl, true);
  xhr.responseType = 'arraybuffer';
  xhr.onload = function() {
    if (xhr.status === 200 || (xhr.status === 0 && xhr.response)) {
      ajax.trigger('binaryLoaded', filePath);
      callback(new Uint8Array(xhr.response));
    } else {
      callback(null);
    }
  };
  xhr.onerror = () => callback(null);
  xhr.send(null);
};

ajax.load = function(filePath: string, targetUrl: string | null, callback: (data: Uint8Array | null) => void) {
  if (ajax.cache[filePath]) {
    callback(ajax.cache[filePath]);
    return;
  }

  ajax.requestBinary(filePath, targetUrl, function(binary) {
    if (!binary) {
      callback(null);
      return;
    }
    ajax.cache[filePath] = binary;
    callback(binary);
  });
};

ajax.loadMKF = function(...filePaths: string[]) {
  var callback = arguments[arguments.length - 1];
  if (typeof callback === 'string') {
    callback = null;
  } else {
    filePaths = filePaths.slice(0, -1);
  }
  filePaths = Array.prototype.slice.call(filePaths);
  return co(function*() {
    for (var i = 0; i < filePaths.length; i++) {
      var filePath = filePaths[i];
      if (ajax.MKF[filePath]) {
        continue;
      }
      var binary: Uint8Array | null = yield function(callback2: (data: Uint8Array | null) => void) {
        ajax.load(filePath, null, callback2);
      };
      if (!binary) {
        console.warn('[ajax] loadMKF failed', filePath);
        continue;
      }
      ajax.MKF[filePath] = new (MKF as any)(binary, { name: filePath });
      ajax.trigger('mkfLoaded', filePath);
    }
    if (typeof callback === 'function') {
      callback();
    }
    return ajax.MKF;
  });
};

export default ajax;
