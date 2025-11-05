import utils from './utils';
import Global from './pal-global';
import MKF from './mkf';
import co from './co';
import config from './config';

console.trace('ajax module load');

/**
 * 异步加载文件
 * @module ajax
 */
var ajax = {
  cache: {},
  MKF: {}
};

utils.extend(ajax, utils.Events);

/**
 * loadBinaryFile
 *
 * @method
 * @param  {String} path
 * @return {Promise}
 */
var loadBinaryFile = ajax.loadBinaryFile = function(path) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function(e) {
      var xhr = e.target;
      if (xhr.status >= 200 && xhr.status < 300 || xhr.status == 304) {
        var data = xhr.response,
            buf = data; //new Uint8Array(data);
        resolve(buf);
      } else if (xhr.status === 404) {
        console.warn('[ajax] loadBinaryFile missing', path, xhr.status);
        resolve(new ArrayBuffer(0));
      } else {
        reject(xhr.status);
      }
    };
    xhr.onerror = function(e) {
      reject(e);
    };
    xhr.onprogress = function(e) {
      if (e.lengthComputable) {
        var percent = e.loaded / e.total * 100;
        //console.log(name, e.loaded, e.total, percent.toFixed(2));
        ajax.fire('progress', {
          path: path,
          percent: percent,
          loaded: e.loaded,
          total: e.total
        });
      }
    };

    xhr.open('GET', config.resolveAssetPath(path), true);
    xhr.responseType = 'arraybuffer';
    xhr.overrideMimeType('text/plain; charset=x-user-defined');
    xhr.send(null);
  });
};

/**
 * loadBig5File
 *
 * @method
 * @param  {String} path
 * @return {Promise}
 */
var loadBig5File = ajax.loadBig5File = function(path) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.onload = function(e) {
      var xhr = e.target;
      if (xhr.status >= 200 && xhr.status < 300 || xhr.status == 304) {
        resolve(e.target.response);
      } else {
        reject(xhr.status);
      }
    };
    xhr.onerror = function(e) {
      reject(e);
    };
    xhr.onprogress = function(e) {
      if (e.lengthComputable) {
        var percent = e.loaded / e.total * 100;
        //console.log(name, e.loaded, e.total, percent.toFixed(2));
        ajax.fire('progress', {
          path: path,
          percent: percent,
          loaded: e.loaded,
          total: e.total
        });
      }
    };

    xhr.open('GET', config.resolveAssetPath(path), true);
    //xhr.responseType = 'arraybuffer';
    xhr.overrideMimeType('text/plain; charset=big5');
    xhr.send(null);
  });
};

/**
 * 加载多个文件
 *
 * @method
 * @param  {Array}    fileList
 * @return {Promise}  全部完成时resolve
 */
var load = ajax.load = function(fileList) {
  if (!Array.isArray(fileList)) fileList = toArray(arguments);
  return co(function*() {
    var deferList = [];
    for (var i=0; i<fileList.length; ++i) {
      var file = fileList[i];
      if (file in ajax.cache) {
        deferList.push(ajax.cache[file]);
      } else {
        deferList.push(ajax.cache[file] = loadBinaryFile(file));
      }
    }
    return yield deferList;
  });
};

/**
 * 加载多个MKF
 *
 * @method
 * @param  {Array} mkfList fileList
 * @return {Promise}       全部完成时resolve
 */
var loadMKF = ajax.loadMKF = function(mkfList) {
  if (!Array.isArray(mkfList)) mkfList = toArray(arguments);
  return co(function*() {
    var fileList = [];
    for (var i=0; i<mkfList.length; ++i) {
      fileList.push(mkfList[i] + '.MKF');
    }
    return ajax.load(fileList).then(function(bufs) {
      for (var i=0; i<mkfList.length; ++i) {
        var name = mkfList[i];
        var buffer = bufs[i];
        var mkf = null;
        try {
          if (buffer && buffer.byteLength >= 8) {
            var view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            mkf = new MKF(view);
          } else {
            console.warn('[ajax] MKF', name, 'missing or empty, continuing with fallback');
          }
        } catch (err) {
          console.warn('[ajax] failed to parse MKF', name, err);
          mkf = null;
        }
        ajax.MKF[name] = mkf;
      }
      return bufs;
    });
  });
};

export default ajax;
