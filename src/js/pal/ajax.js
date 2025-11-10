import traceModuleLoad from './util-trace';
import utils from './utils';
import Global from './pal-global';
import MKF from './mkf';
import co from './co';
import config from './config';

traceModuleLoad('ajax module load');

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
function requestWithCandidates(path, candidates, options) {
  var urls = candidates && candidates.length ? candidates : [config.resolveAssetPath(path)];
  return new Promise(function(resolve, reject) {
    function tryNext(index) {
      if (index >= urls.length) {
        if (options && typeof options.onMissing === 'function') {
          resolve(options.onMissing());
        } else {
          resolve(new ArrayBuffer(0));
        }
        return;
      }
      var xhr = new XMLHttpRequest();
      xhr.onload = function(e) {
        var target = e.target;
        if (target.status >= 200 && target.status < 300 || target.status == 304) {
          resolve(target.response);
        } else if (target.status === 404) {
          console.warn('[ajax] missing', path, target.status, urls[index]);
          tryNext(index + 1);
        } else {
          reject(target.status);
        }
      };
      xhr.onerror = function(err) {
        if (index + 1 < urls.length) {
          tryNext(index + 1);
        } else {
          reject(err);
        }
      };
      xhr.onprogress = function(e) {
        if (e.lengthComputable) {
          var percent = e.loaded / e.total * 100;
          ajax.fire('progress', {
            path: path,
            percent: percent,
            loaded: e.loaded,
            total: e.total
          });
        }
      };
      xhr.open('GET', urls[index], true);
      if (options && options.responseType) {
        xhr.responseType = options.responseType;
      }
      if (options && options.mimeType) {
        xhr.overrideMimeType(options.mimeType);
      }
      xhr.send(null);
    }
    tryNext(0);
  });
}

var loadBinaryFile = ajax.loadBinaryFile = function(path) {
  var candidates = typeof config.resolveAssetPathCandidates === 'function'
    ? config.resolveAssetPathCandidates(path)
    : [config.resolveAssetPath(path)];
  return requestWithCandidates(path, candidates, {
    responseType: 'arraybuffer',
    mimeType: 'text/plain; charset=x-user-defined',
    onMissing: function() {
      return new ArrayBuffer(0);
    }
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
  var candidates = typeof config.resolveAssetPathCandidates === 'function'
    ? config.resolveAssetPathCandidates(path)
    : [config.resolveAssetPath(path)];
  return requestWithCandidates(path, candidates, {
    mimeType: 'text/plain; charset=big5',
    onMissing: function() {
      return '';
    }
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
            mkf = new MKF(view, { name: name });
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
