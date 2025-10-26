import config from './config';
import stateService from '../../services/state-service.js';

console.trace('music module load');

var music = {};

function pad(num, size) {
  var s = num+"";
  while (s.length < size) s = "0" + s;
  return s;
}

music.play = function() {
  stateService.setGlobal('numMusic', arguments[0]);
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
  var target = config.resolveAudioPath(pad(arguments[0], 3) + ".mp3");
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
      log.warn('[MUSIC] preload failed: %o', ex);
    }
  }
  audio.pause();
  var playPromise;
  try {
    playPromise = audio.play();
  } catch (ex) {
    log.warn('[MUSIC] play failed: %o', ex);
    return;
  }
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(function(err) {
      log.warn('[MUSIC] playback rejected: %o', err);
    });
  }
};

music.stop = function() {
  var audio = document.getElementById('bg-music');
  if (audio && config.enableAudio) {
    try {
      audio.pause();
    } catch (ex) {
      log.warn('[MUSIC] stop failed: %o', ex);
    }
  }
};

export default music;
