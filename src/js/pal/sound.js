import traceModuleLoad from './util-trace';
traceModuleLoad('sound module load');

var sound = {};

sound.play = function() {
  var args = toArray(arguments);
  log.debug(['[SOUND] play'].concat(args).join(' '));
};

export default sound;
