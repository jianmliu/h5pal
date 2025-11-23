import traceModuleLoad from './util-trace';
import config from './config';
import worldService from '../../services/world-service.js';

traceModuleLoad('music module load');

var music = {};

music.play = function() {
  worldService.setMusicTrack(arguments[0]);
  var args = toArray(arguments);
  log.debug(['[MUSIC] play'].concat(args).join(' '));
  if (!config.enableAudio || !config.audioBaseUrl) {
    log.trace('[MUSIC] audio disabled, skip %s', args[0]);
    return;
  }
  var audio = document.getElementById('bg-music');
  var audioSource = audio && document.getElementById('bg-music-source');
  if (!audio || !audioSource) {
    log.warn('[MUSIC] audio element not ready, skip');
    return;
  }
  var target = config.resolveAudioPath(String(arguments[0]) + ".mp3");
  if (!target) {
    log.trace('[MUSIC] audio path unavailable');
    return;
  }
  var current = audioSource.dataset ? audioSource.dataset.src : audioSource.getAttribute('data-src');
  if (current !== target) {
    if (audioSource.dataset) {
      audioSource.dataset.src = target;
    } else {
      audioSource.setAttribute('data-src', target);
    }
    audioSource.src = target;
    try {
      audio.pause();
      audio.load();
    } catch (ex) {
      log.warn('[MUSIC] preload failed: %s', ex && ex.message ? ex.message : ex);
    }
  }
  audio.pause();
  var playPromise;
  try {
    playPromise = audio.play();
  } catch (ex) {
    log.warn('[MUSIC] play failed: %s', ex && ex.message ? ex.message : ex);
    return;
  }
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(function(err) {
      log.warn('[MUSIC] playback rejected: %s', err && err.message ? err.message : err);
    });
  }
};

music.stop = function() {
  var audio = document.getElementById('bg-music');
  if (audio && config.enableAudio) {
    try {
      audio.pause();
    } catch (ex) {
      log.warn('[MUSIC] stop failed: %s', ex && ex.message ? ex.message : ex);
    }
  }
};

export default music;
