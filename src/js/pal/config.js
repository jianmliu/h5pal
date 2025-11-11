import traceModuleLoad from './util-trace';

traceModuleLoad('config module load');

function normalizeBase(url) {
  if (!url) return '';
  return url.replace(/\/+$/, '') + '/';
}

var globalConfig = (typeof window !== 'undefined' && window.PAL_CONFIG) || {};

var defaults = {
  assetBaseUrl: './pal-assets/',
  audioBaseUrl: null,
  enableTouch: true,
  enableAudio: false,
  enableModAssets: true,
  modAssetBaseUrl: './pal-assets/exported-assets/',
  modSpriteBaseUrl: './pal-assets/exported-sprites/',
  enableOverviewMode: false,
  showEventObjectLabels: false,
  enableAIControl: false,
  embeddingSource: 'storygraph-embeddings.json',
  embeddingModel: 'nomic-embed-text',
  llmModel: null
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
baseConfig.modAssetBaseUrl = normalizeBase(baseConfig.modAssetBaseUrl || defaults.modAssetBaseUrl);
baseConfig.modSpriteBaseUrl = normalizeBase(baseConfig.modSpriteBaseUrl || defaults.modSpriteBaseUrl);
baseConfig.enableModAssets = baseConfig.enableModAssets !== false;
baseConfig.enableOverviewMode = baseConfig.enableOverviewMode === true;
baseConfig.enableAIControl = baseConfig.enableAIControl === true;
baseConfig.embeddingSource = baseConfig.embeddingSource || defaults.embeddingSource;
baseConfig.embeddingModel = baseConfig.embeddingModel || defaults.embeddingModel;
baseConfig.llmModel = baseConfig.llmModel || defaults.llmModel;

var audioConfigured = typeof baseConfig.audioBaseUrl === 'string' && baseConfig.audioBaseUrl.length > 0;
if (audioConfigured || baseConfig.enableAudio) {
  baseConfig.enableAudio = true;
  baseConfig.audioBaseUrl = normalizeBase(baseConfig.audioBaseUrl || (baseConfig.assetBaseUrl + 'MP3/'));
} else {
  baseConfig.enableAudio = false;
  baseConfig.audioBaseUrl = null;
}

function shouldUseModOverride(path) {
  var lowered = (path || '').toLowerCase();
  if (
    lowered.endsWith('.mkf') ||
    lowered.endsWith('.asc') ||
    lowered.endsWith('.fon') ||
    lowered.endsWith('.dat') ||
    lowered.endsWith('.msg')
  ) {
    return false;
  }
  return true;
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

function resolveModAssetPath(path) {
  path = path || '';
  if (!baseConfig.enableModAssets || !baseConfig.modAssetBaseUrl) return null;
  if (path.charAt(0) === '/') {
    path = path.substring(1);
  }
  return baseConfig.modAssetBaseUrl + path;
}

function resolveModSpritePath(path) {
  path = path || '';
  if (!baseConfig.enableModAssets || !baseConfig.modSpriteBaseUrl) return null;
  if (path.charAt(0) === '/') {
    path = path.substring(1);
  }
  return baseConfig.modSpriteBaseUrl + path;
}

function normalizeRelativePath(path) {
  path = path || '';
  if (path.charAt(0) === '/') {
    return path.substring(1);
  }
  return path;
}

function resolveAssetPathCandidates(path) {
  var normalized = normalizeRelativePath(path);
  var list = [];
  if (baseConfig.enableModAssets && baseConfig.modAssetBaseUrl && shouldUseModOverride(normalized)) {
    list.push(baseConfig.modAssetBaseUrl + normalized);
  }
  list.push(baseConfig.assetBaseUrl + normalized);
  return list;
}

function resolveAudioPathCandidates(path) {
  var normalized = normalizeRelativePath(path);
  var list = [];
  if (baseConfig.enableModAssets && baseConfig.modAssetBaseUrl && shouldUseModOverride(normalized)) {
    list.push(baseConfig.modAssetBaseUrl + normalized);
  }
  if (baseConfig.audioBaseUrl) {
    list.push(baseConfig.audioBaseUrl + normalized);
  }
  return list;
}

baseConfig.resolveAssetPath = resolveAssetPath;
baseConfig.resolveAudioPath = resolveAudioPath;
baseConfig.resolveModAssetPath = resolveModAssetPath;
baseConfig.resolveModSpritePath = resolveModSpritePath;
baseConfig.resolveAssetPathCandidates = resolveAssetPathCandidates;
baseConfig.resolveAudioPathCandidates = resolveAudioPathCandidates;

export default baseConfig;
