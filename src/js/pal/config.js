import traceModuleLoad from './util-trace';

/** @typedef {import('../../types/pal').PalConfig} PalConfig */
/** @typedef {import('../../types/pal').PartialPalConfig} PartialPalConfig */

traceModuleLoad('config module load');

/**
 * Normalize a base URL so it always ends with a single '/'.
 * @param {string | null | undefined} url
 * @returns {string}
 */
function normalizeBase(url) {
  if (!url) return '';
  return url.replace(/\/+$/, '') + '/';
}

/** @type {PartialPalConfig} */
const globalConfig = (typeof window !== 'undefined' && window.PAL_CONFIG) || {};

/** @type {PartialPalConfig} */
const defaults = {
  assetBaseUrl: './pal-assets/',
  audioBaseUrl: null,
  enableTouch: true,
  enableAudio: false,
  enableModAssets: true,
  modAssetBaseUrl: './pal-assets/exported-assets/',
  modSpriteBaseUrl: './pal-assets/exported-sprites/',
  enableOverviewMode: false,
  enablePanorama: true,
  mapOverlayMode: 'gps',
  showEventObjectLabels: false,
  enableAIControl: false,
  enableNPCBehaviours: false,
  enableMud: false,
  embeddingSource: 'storygraph-embeddings.json',
  embeddingModel: 'nomic-embed-text',
  llmModel: null
};

/** @type {PartialPalConfig} */
const baseConfig = {};
for (const key in defaults) {
  if (Object.prototype.hasOwnProperty.call(defaults, key)) {
    baseConfig[key] = defaults[key];
  }
}
for (const cfgKey in globalConfig) {
  if (Object.prototype.hasOwnProperty.call(globalConfig, cfgKey)) {
    baseConfig[cfgKey] = globalConfig[cfgKey];
  }
}

baseConfig.assetBaseUrl = normalizeBase(baseConfig.assetBaseUrl || defaults.assetBaseUrl);
baseConfig.modAssetBaseUrl = normalizeBase(baseConfig.modAssetBaseUrl || defaults.modAssetBaseUrl);
baseConfig.modSpriteBaseUrl = normalizeBase(baseConfig.modSpriteBaseUrl || defaults.modSpriteBaseUrl);
baseConfig.enableModAssets = baseConfig.enableModAssets !== false;
baseConfig.enableOverviewMode = baseConfig.enableOverviewMode === true;
baseConfig.enablePanorama = baseConfig.enablePanorama === true;
const normalizedOverlayMode = (baseConfig.mapOverlayMode || (baseConfig.enableOverviewMode ? 'gps' : 'off'));
const overlayMode = typeof normalizedOverlayMode === 'string'
  ? normalizedOverlayMode.toLowerCase()
  : (normalizedOverlayMode ? 'gps' : 'off');
if (overlayMode === 'panorama') {
  baseConfig.enablePanorama = true;
}
if (overlayMode === 'gps') {
  baseConfig.enableOverviewMode = true;
}
baseConfig.enableAIControl = baseConfig.enableAIControl === true;
baseConfig.enableNPCBehaviours = baseConfig.enableNPCBehaviours === true;
baseConfig.enableMud = baseConfig.enableMud === true;
baseConfig.embeddingSource = baseConfig.embeddingSource || defaults.embeddingSource;
baseConfig.embeddingModel = baseConfig.embeddingModel || defaults.embeddingModel;
baseConfig.llmModel = baseConfig.llmModel || defaults.llmModel;

const audioConfigured = typeof baseConfig.audioBaseUrl === 'string' && baseConfig.audioBaseUrl.length > 0;
if (audioConfigured || baseConfig.enableAudio) {
  baseConfig.enableAudio = true;
  baseConfig.audioBaseUrl = normalizeBase(baseConfig.audioBaseUrl || (baseConfig.assetBaseUrl + 'MP3/'));
} else {
  baseConfig.enableAudio = false;
  baseConfig.audioBaseUrl = null;
}

function shouldUseModOverride(path) {
  const lowered = (path || '').toLowerCase();
  if (
    lowered.endsWith('.mkf') ||
    lowered.endsWith('.asc') ||
    lowered.endsWith('.fon') ||
    lowered.endsWith('.dat') ||
    lowered.endsWith('.msg') ||
    lowered.endsWith('.rpg')
  ) {
    return false;
  }
  return true;
}

/**
 * @param {string} path
 * @returns {string}
 */
function resolveAssetPath(path) {
  path = path || '';
  if (path.charAt(0) === '/') {
    path = path.substring(1);
  }
  return /** @type {string} */ (baseConfig.assetBaseUrl) + path;
}

/**
 * @param {string} path
 * @returns {string | null}
 */
function resolveAudioPath(path) {
  path = path || '';
  if (!baseConfig.audioBaseUrl) return null;
  if (path.charAt(0) === '/') {
    path = path.substring(1);
  }
  return /** @type {string} */ (baseConfig.audioBaseUrl) + path;
}

/**
 * @param {string} path
 * @returns {string | null}
 */
function resolveModAssetPath(path) {
  path = path || '';
  if (!baseConfig.enableModAssets || !baseConfig.modAssetBaseUrl) return null;
  if (path.charAt(0) === '/') {
    path = path.substring(1);
  }
  return baseConfig.modAssetBaseUrl + path;
}

/**
 * @param {string} path
 * @returns {string | null}
 */
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

/**
 * @param {string} path
 * @returns {string[]}
 */
function resolveAssetPathCandidates(path) {
  const normalized = normalizeRelativePath(path);
  const list = [];
  if (baseConfig.enableModAssets && baseConfig.modAssetBaseUrl && shouldUseModOverride(normalized)) {
    list.push(baseConfig.modAssetBaseUrl + normalized);
  }
  list.push(/** @type {string} */ (baseConfig.assetBaseUrl) + normalized);
  return list;
}

/**
 * @param {string} path
 * @returns {string[]}
 */
function resolveAudioPathCandidates(path) {
  const normalized = normalizeRelativePath(path);
  const list = [];
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

const config = /** @type {PalConfig} */ (baseConfig);

export default config;
