console.trace('config module load');

function normalizeBase(url) {
  if (!url) return '';
  return url.replace(/\/+$/, '') + '/';
}

var globalConfig = (typeof window !== 'undefined' && window.PAL_CONFIG) || {};

var defaults = {
  assetBaseUrl: './pal-assets/',
  audioBaseUrl: null,
  enableTouch: true,
  enableAudio: false
};

var baseConfig = {};
for (var key in defaults) {
    if (Object.prototype.hasOwnProperty.call(defaults, key)) {
        baseConfig[key] = defaults[key];
    }
}
for (var cfgKey in globalConfig) {
  if (Object.prototype.hasOwnProperty.call(globalConfig, cfgKey)) {
    baseConfig[cfgKey] = globalConfig[cfgKey];
  }
}

baseConfig.assetBaseUrl = normalizeBase(baseConfig.assetBaseUrl || defaults.assetBaseUrl);

var audioConfigured = typeof baseConfig.audioBaseUrl === 'string' && baseConfig.audioBaseUrl.length > 0;
if (audioConfigured || baseConfig.enableAudio) {
  baseConfig.enableAudio = true;
  baseConfig.audioBaseUrl = normalizeBase(baseConfig.audioBaseUrl || (baseConfig.assetBaseUrl + 'MP3/'));
} else {
  baseConfig.enableAudio = false;
  baseConfig.audioBaseUrl = null;
}

function resolveAssetPath(path) {
  path = path || '';
  if (path.charAt(0) === '/') {
    path = path.substring(1);
  }
  return baseConfig.assetBaseUrl + path;
}

function resolveAudioPath(path) {
  path = path || '';
  if (!baseConfig.audioBaseUrl) return null;
  if (path.charAt(0) === '/') {
    path = path.substring(1);
  }
  return baseConfig.audioBaseUrl + path;
}

baseConfig.resolveAssetPath = resolveAssetPath;
baseConfig.resolveAudioPath = resolveAudioPath;

export default baseConfig;
