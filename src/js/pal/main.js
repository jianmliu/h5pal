import traceModuleLoad from './util-trace';
import input from './input';
import Surface from './surface';
import Palette from './palette';
import welcome from './welcome';
import ui from './ui';
import scene from './scene';
import game from './game';
import rng from './rng';
import co from './co';
import services from '../../services/index.js';
import modService from '../../services/mod-service.js';
import worldService from '../../services/world-service.js';
import { bootstrapAI } from '../../ai/ai-controller.js';
import '../../tools/storygraph-export.js';
import '../../tools/npc-map-export.js';
import config from './config';
import overviewController from './overview-controller';

traceModuleLoad('main module load');

var main = {};

main.initGlobals = function*() {
  worldService.setPartyDirection(4);
  worldService.setFrameNum(0);
  worldService.setObjectDescTable(null);
  if (!PAL_CLASSIC) {
    //#ifndef PAL_CLASSIC
    //   BYTE             bBattleSpeed;        // Battle Speed (1 = Fastest, 5 = Slowest)
    //#endif
    worldService.setBattleSpeed(2);
  }

  // Open files
  var mkfs = ['FBP', 'MGO', 'BALL', 'DATA', 'F', 'FIRE', 'RGM', 'SSS', 'PAT'];
  yield services.resource.loadMKF(...mkfs);
  mkfs.forEach(function(name) {
    Files[name] = services.resource.getMKF(name);
  });

  const objectDesc = yield services.resource.loadObjectDesc('desc.dat');
  worldService.setObjectDescTable(objectDesc);

  worldService.setCurrentSaveSlot(1);
};

main.start = function() {
  return co(function*() {
    yield main.initGlobals();

    const resource = services.resource;
    if (resource) {
      yield resource.loadMKF('DATA', 'FBP');
    }

    global.services = services;
    services.world.init();

    Palette.init(Files.PAT);

    if (overviewController && typeof overviewController.setEnabled === 'function') {
      overviewController.setEnabled(!!config.enableOverviewMode);
    }

    if (modService && typeof modService.prepare === 'function') {
      yield modService.prepare();
    }

    var surf = new Surface(
      document.getElementById('cvs'),
      320,
      200,
      document.getElementById('debug')
    );

    yield ui.init(surf, services); // 初始化UI，内含初始化文字

    yield rng.init(surf);

    input.init();

    yield welcome.trademarkScreen(surf); // 软星商标

    yield welcome.splashScreen(surf); // 开场动画

    yield scene.init(surf); // 初始化场景

    input.init();

    yield game.init(surf);

    let runtimeAiFlag = false;
    let npcOverride = null;
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        runtimeAiFlag = params.get('ai') === '1' || window.location.search.includes('ai=1');
        if (params.has('npc')) {
          npcOverride = params.get('npc') === '1';
        }
      } catch (err) {
        runtimeAiFlag = typeof window !== 'undefined' && window.location.search.includes('ai=1');
      }
    }
    const enablePlayerAI = runtimeAiFlag && config.enableAIControl;
    const enableNPCBehaviours = typeof npcOverride === 'boolean'
      ? npcOverride
      : config.enableNPCBehaviours;
    if (enablePlayerAI || enableNPCBehaviours) {
      bootstrapAI({
        logStart: true,
        useLLM: enablePlayerAI,
        enablePlayerAutomation: enablePlayerAI,
        enableNPCBehaviours
      }).catch((err) => {
        console.error('[main] Failed to bootstrap AI controller', err);
      });
    }

    if (typeof window !== 'undefined') {
      window.bootstrapAI = bootstrapAI;
    }

    yield game.main(); // 启动游戏

    console.log('over了');
  });
};

export default main;
