h5pal
=====

# Introduction

《仙剑奇侠传》[(百度百科)](http://baike.baidu.com/view/2188.htm#sub5215543)的HTML5 移植，基于[SDLPAL](http://sdlpal.codeplex.com)。

&lt;The Legend of Sword and Fairy> I.E. PAL [(wikipedia)](http://en.wikipedia.org/wiki/The_Legend_of_Sword_and_Fairy) porting to HTML5. Based on [SDLPAL](http://sdlpal.codeplex.com).

[English version of this README](#ENG)

## 最近更新

- 支持触控手势：点击屏幕中部确认，划动控制主角移动，移动端直接可玩。
- 新增 `PAL_CONFIG` 配置，默认从 `pal-assets/` 读取资源，可按需重定向或开启背景音乐。
- 音乐可选：默认关闭 MP3 播放，若准备好原版 MP3 资源，将 `PAL_CONFIG.enableAudio` 设为 `true` 并提供 `audioBaseUrl`。
- 系统菜单的存档/读档使用浏览器 localStorage，可选择 1~5 号槽位。
- 构建产物可直接复制到 `xianjian.github.com/ultimate/`，包含运行所需资源。
- 新增 `h5pal/scripts/import-rpg-save.mjs`，可将 DOS 版 `SAVEDATAxx.RPG` 转换成本项目使用的 localStorage 存档。
- 核心模块已完全接入响应式状态：通过 `environment-/scene-/save-data-adapter` 等读取切片，旧的 `worldService.get*Struct` 接口已经移除，并补充了对应适配器测试确保回归。
- 新增调试辅助：`debugUtils.startReactiveTrace()` 可实时监听 slice 事件，`debugUtils.startRenderProfiling()` 可输出场景/战斗渲染耗时。

## 架构概述

- **ECS 内核**：`src/ecs` 定义实体、组件与系统。地图、队伍、战斗等运行态数据通过组件挂载在 `worldService.registry` 上，由 `world-systems.js` 在逐帧循环里维护。
- **响应式状态切片**：游戏状态拆分为 `state/slices/*.js`，并通过服务适配器（如 `scene-data-adapter`、`player-state-adapter`、`save-data-adapter`）对外暴露读写接口。新逻辑优先使用适配器快照，旧的 `worldService` getter 仅作为兜底。
- **服务总线**：`services/index.js` 统一导出运行期服务，可在 AMD 构建下通过 `require(['../services/index'], (module) => { const services = module.default; })` 直接访问 `services.adapters.*`。

## 调试工具

- 调试入口：`require(['js/pal/debug-utils'], (debugUtils) => { ... });`
- **响应式追踪**：`debugUtils.startReactiveTrace('SceneTrace', { filter: ({ slice }) => slice === 'scene-events' });` 实时输出切片变更，`stopReactiveTrace('SceneTrace')` 结束。
- **渲染性能**：`debugUtils.startRenderProfiling({ threshold: 8 })` 记录场景/战斗渲染耗时，`stopRenderProfiling()` 停止。
- **调试覆盖层**：`debugUtils.debugOverlay.startOverlay();` 在页面右侧生成 HUD，展示 FPS、场景/战斗状态、Sprite/RLE 缓存统计；`stopOverlay()` 可关闭。
- **资源检查**：`debugUtils.inspectSprite(spriteId)`、`debugUtils.inspectRLE(rleId)` 快速查看缓存内容与尺寸。

# 如何搞起

## 环境

* [Node.js](http://nodejs.org/)
* [gulp](http://gulpjs.com/)
* [bower](http://bower.io/)

## 构建

* `bower install`
* `npm install`
* `gulp`
* 若需要替换资源，可准备仙剑95版（存档180~185KB版本）的所有文件放入`pal-assets/`目录（仓库已预置示例）。

## 导入 DOS 版 RPG 存档

1. 准备原版 `SAVEDATAxx.RPG` 存档文件。
2. 在项目根目录执行：

   ```bash
   node h5pal/scripts/import-rpg-save.mjs --input path/to/SAVEDATA01.RPG --slot 1 --output pal-save-1.json
   ```

   - `--slot` 会打印一段 `localStorage.setItem(...)` 代码，粘贴到浏览器控制台即可写入对应槽位（`PAL-SAVE-1`）。
   - `--output` 可额外导出 JSON 文件，方便备份或后续导入。

3. 刷新游戏页面，在系统菜单中选择相同槽位即可读档。

> 提示：旧版存档没有时间戳，转换时会默认填写当前时间；如需自定义可使用 `--timestamp`、`--saved-times` 参数。

## 运行

* `gulp serve`
* 在`chrome://flags`里打开_“启用实验性JavaScript”_
* 打开[http://localhost:8005/h5pal.html](http://localhost:8005/h5pal.html) 
* 或直接打开 `dist/h5pal.html`（构建完成后），可整包部署至 `xianjian.github.com/ultimate/`
* 若使用 `rsync` 同步，可运行  
    `rsync -a --exclude 'pal-assets/' dist/ ../ultimate/`（避免误删 `pal-assets/` 下的原始与导出资源）
* Enjoy

## 常用 npm 指令

| 指令 | 功能 |
| --- | --- |
| `npm run export:sprites` | 解析 BALL/RGM/FBP 等 MKF，将精灵、背景导出到 `pal-assets/exported-sprites/`（包含配套 manifest）。 |
| `npm run export:overviews` | 调用地图导出脚本生成全景图，默认写入 `pal-assets/exported-assets/map-overview/scene-<mapId>.png`，可用 `--maps`、`--zoom` 过滤。 |
| `npm run export:storygraphs` | 在 Node 环境运行 StoryGraph 导出脚本，把所有场景的图写入 `pal-assets/exported-storygraphs/scene-*.json` 与 manifest。 |
| `npm run export:npc-map` | 扫描 `pal-assets/exported-storygraphs` 中的场景，聚合 NPC 名称与事件 ID，输出 `pal-assets/npc-event-map.json`。 |
| `npm run embeddings:storygraph` | 仅读取 StoryGraph JSON，并将嵌入结果输出到 `pal-assets/storygraph-embeddings.json`（AI 检索使用的主文件）。 |
| `npm run embeddings:docs` | 仅针对 `../docs/` 下的攻略/对白等文本生成嵌入，写入 `pal-assets/storygraph-embeddings.json`。 |
| `npm run embeddings:all` | StoryGraph + docs 双管齐下，同样输出 `pal-assets/storygraph-embeddings.json`。 |
| `npm run mud:deploy` | 在指定的 Foundry/MUD 合约目录中执行 `mud deploy`（默认 profile 为 `local`，可通过 `MUD_PROFILE` 或命令行参数覆盖）。 |
| `npm run mud:codegen` | 在同一目录执行 `mud codegen`，若设置 `MUD_WORLD_ABI` 会自动把生成的 ABI 拷贝到 `src/mud/worldAbi.json`。 |
| `npm run test` / `npm run test:ci` | 运行 Vitest（CI 版本带 `--experimental-global-webcrypto` 以兼容管线环境）。 |

### MUD 本地链脚本

1. **启动链（Point #1）**：在另一个终端运行 `anvil --port 8545 --host 127.0.0.1`（或任意 Foundry 节点）。
2. **部署合约（Point #2）**：在本仓库执行 `npm run mud:deploy`，脚本会自动切换到 `MUD_CONTRACTS_DIR` 并运行 `mud deploy --profile=<profile>`。默认 profile 为 `local`，可通过 `MUD_PROFILE=redstone npm run mud:deploy` 或附加 `--profile=xxx` 参数覆盖。
3. **生成 ABI（Point #3）**：运行 `npm run mud:codegen`，若在环境变量中提供 `MUD_WORLD_ABI`（绝对路径或相对 `MUD_CONTRACTS_DIR` 的路径），脚本会把文件复制到 `src/mud/worldAbi.json`，供浏览器侧 `mud-client` 使用。

常用环境变量：

- `MUD_CONTRACTS_DIR`: 指向 Foundry/MUD 合约目录。若未设置，脚本会尝试 `onchain/`、`onchain/contracts/`，最后回退到 `../mud/templates/vanilla/packages/contracts`。
- `MUD_PROFILE`: 传递给 `mud deploy` 的 profile 名，默认 `local`。
- `MUD_WORLD_ABI`: `mud codegen` 产物（例如 `out/world/world.abi.json`）的路径；设置后会覆盖 `src/mud/worldAbi.json`。
- 其他 `mud` CLI 所需的变量（如 `.env` 中的 `PRIVATE_KEY`、`RPC_URL`）可照常放在合约目录下。

### NPC 事件映射导出

在页面载入游戏后打开浏览器控制台，执行 `npcMap.exportMap()` 即可遍历全部 `scene.events.objects`，根据触发脚本对白里的角色名生成 `name -> { sceneId, eventObjectId }` 映射，并自动下载 `npc-event-map.json`。若想在 CI/Node 环境批量导出，可运行 `npm run export:npc-map -- --output ../ultimate/pal-assets/npc-event-map.json`，默认读取 `pal-assets/exported-storygraphs/scene-*.json`。

常用参数：

- `npcMap.exportMap({ download: false })`：返回结果对象而不是触发下载。
- `npcMap.exportMap({ sceneIds: [1, 2, 16] })`：仅扫描指定场景。
- `npcMap.exportMap({ filename: 'li_family-npcs.json', maxDialoguesPerEvent: 3 })`：自定义文件名及每个事件附带的对白数量。

### 迷宫扩展视图 / Panorama 模式

1. 使用 `PAL_CONFIG.mapOverlayMode` 控制显示方式：`'off'`（默认）、`'gps'`（右下角迷你图，等价于旧 `enableOverviewMode`）、`'panorama'`（以整块遮罩显示完整迷宫，适合 MMO 观察视角）。运行中也可以在控制台调用 `PAL_OVERVIEW.setMode('panorama')` 等命令动态切换。
2. 在 `pal-assets/exported-assets/map-overview/` 下放置场景截图（例如 `scene-123.png` 或 `123.png`）。`npm run export:overviews -- --zoom=2` 会读取 MAP/GOP 并输出高分辨率全景 PNG，同时生成 `map-overview-manifest.json` 供运行时定位。
3. Panorama 模式现在会调用运行时渲染器，将整张地图绘制到独立画布（实验中，仅底图，后续会叠加 NPC/玩家）；迷你 GPS 模式仍使用 220×220 的角落浮层。
4. 没有覆盖的场景会自动隐藏该层，回退到原始渲染，因此不需要一次性导出全部。
5. 提示：导出的 `scene-<mapId>.png` 会在 manifest 中一对多映射到所有引用该 MAP 的场景；如需自定义截图，可手动替换文件并更新 manifest。

# 其他

## 一句话，我TM就想知道能玩吗？

能走，能对话，能开宝箱，能用道具，能打架（没完全实现）……能做很多事情，排除BUG造成剧情无法进行下去以外，只靠走地图可以体验很多很多剧情……了。

因为战斗系统有很多没实现以及很多BUG，当出错的时候会直接判定为赢。建议到`common.js`里打开`INVINCIBLE`开启无敌降低游戏难度。

## 没图你说个JB

[Screenshots](http://liuji-jim.github.io/h5pal/screenshots.html)

## 完成度

| 模块 | 进度 |
| --- | ---:|
| 资源 | 90% |
| 读档 | 99% |
| 存档 | 40% |
| Surface | 90% |
| 位图 | 99% |
| Sprite | 99% |
| 地图 | 90% |
| 场景 | 90% |
| 调色盘 | 90% |
| 文本 | 99% |
| 脚本（天坑） | 70% |
| 平常UI | 90% |
| 战斗UI | 90% |
| 战斗（天坑） | 70% |
| 播片 | 90% |
| 结局 | 95% |
| 音乐 | 0% |
| 音效 | 0% |

~~以上数值除了为0的外都是盲目乐观的~~

## 已知问题

[Issues](https://github.com/LiuJi-Jim/h5pal/issues)太多了，懒得列，慢慢补。

## 开发者须知

* ES6 and [babel](http://babeljs.io/)
* ES6 [generator/yield](http://jimliu.net/2014/11/28/a-brief-look-at-es6-generator-function/) and [co](https://github.com/tj/co)
* 逐步将 PAL 的运行时迁移到响应式状态管理。参见 `docs/reactive-migration-guide.md` 了解切片模式和示例。
* ECS 组件、系统定义位于 `src/ecs/`，配合 `services/world-service.js` 管理实体生命周期。
* 调试与性能分析工具集中在 `src/js/pal/debug-utils.js`，推荐在开发过程中开启 Overlay、Reactive Trace 及时捕获异常。

## License

GPL v3

## Inspired by [SDLPAL](http://sdlpal.codeplex.com)

## 结语

仙剑20岁生日快乐

----

# <a name="ENG"></a>How to play

## Environment

* [Node.js](http://nodejs.org/)
* [gulp](http://gulpjs.com/)
* [bower](http://bower.io/)

## Build

* `bower install`
* `npm install`
* `gulp`
* Optionally replace the bundled assets by copying pal95 (180~185KB save) files into `pal-assets/` (a sample set is already included).

## Importing legacy RPG saves

1. Grab the original `SAVEDATAxx.RPG` files.
2. From the project root run:

   ```bash
   node h5pal/scripts/import-rpg-save.mjs --input path/to/SAVEDATA01.RPG --slot 1 --output pal-save-1.json
   ```

   - `--slot` prints a ready-to-paste `localStorage.setItem(...)` snippet that writes to `PAL-SAVE-<slot>`.
   - `--output` stores the converted JSON on disk for backup/reuse.

3. Reload the game and pick the same slot inside the system menu.

> The legacy format has no timestamp; the converter fills it with `Date.now()` unless you override it with `--timestamp` / `--saved-times`.

## Run

* `gulp serve`
* Turn on _"Enable experimental JavaScript"_ in `chrome://flags`
* Open [http://localhost:8005/h5pal.html](http://localhost:8005/h5pal.html) 
* Enjoy

# Architecture overview

- **ECS core** – runtime data (map, party, battle) lives in the entity/component registry under `src/ecs`, managed by `worldService` and updated through `world-systems.js`.
- **Reactive slices** – application state is split into `state/slices/*.js` and exposed via adapters such as `scene-data-adapter`, `player-state-adapter`, and `save-data-adapter`. New features should consume adapters first and treat legacy `worldService` getters as fallbacks only.
- **Service hub** – `services/index.js` re-exports every service/adapter. In the AMD build invoke `require(['../services/index'], (module) => { const services = module.default; /* ... */ });` to reach `services.adapters.*`.

# Debug utilities

- Load helpers with `require(['js/pal/debug-utils'], (debugUtils) => { ... });`.
- **Reactive tracing** – `debugUtils.startReactiveTrace('SceneTrace', { filter: ({ slice }) => slice === 'scene-events' });` streams slice mutations; call `stopReactiveTrace('SceneTrace')` to halt.
- **Render profiling** – `debugUtils.startRenderProfiling({ threshold: 8 });` records scene/battle render cost. Use `stopRenderProfiling()` when done.
- **Overlay HUD** – `debugUtils.debugOverlay.startOverlay();` spawns an on-page panel showing FPS, scene/battle snapshot, and sprite/RLE cache stats. `stopOverlay()` hides it.
- **Sprite/RLE inspection** – `debugUtils.inspectSprite(spriteId)` / `debugUtils.inspectRLE(rleId)` dump cache metadata to help diagnose asset issues.

# Etc.

## I'm just wondering whether I can play it or not.

You can walk, talk, open chests, use items, fight ... a lot of thing in this game. Without some bugs crashing the game, you can experience the story well.

Due to the completeness and bugs of battle module, you will be judged as win when exception happens. I strongly advise you to turn on `INVINCIBLE` in `common.js` to make the game easier.

## STFU without pictures

[Screenshots](http://liuji-jim.github.io/h5pal/screenshots.html)

## Progress

| Module | Progress |
| --- | ---:|
| Resource | 90% |
| Loading | 99% |
| Saving | 40% |
| Surface | 90% |
| Bitmap | 99% |
| Sprite | 99% |
| Map | 90% |
| Scene | 90% |
| Palette | 90% |
| Text | 99% |
| Script (OMG) | 70% |
| Game UI | 90% |
| Battle UI | 90% |
| Battle (OMG) | 70% |
| Movie | 90% |
| Ending | 95% |
| Music | 0% |
| Sound | 0% |

~~Numbers above are all given at will except zeros.~~

## Known Issues

[Issues](https://github.com/LiuJi-Jim/h5pal/issues) - tooooo many. Will fill this later.

## Developers should know first

* ES6 and [babel](http://babeljs.io/)
* ES6 [generator/yield](http://jimliu.net/2014/11/28/a-brief-look-at-es6-generator-function/) and [co](https://github.com/tj/co)

## License

GPL v3

## Inspired by [SDLPAL](http://sdlpal.codeplex.com)

## Ending

Happy 20th birthday to pal.
