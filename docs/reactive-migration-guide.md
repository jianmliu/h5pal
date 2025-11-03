# Reactive Migration Playbook

This document captures the pattern we are using to move PAL's legacy globals
(`Global.*`, raw `stateService` writes, ECS mirrors) onto the new reactive
backbone (RxJS event streams + `@preact/signals-core`). Each state domain should
follow the same checklist to keep behaviour predictable while we phase in the
architecture.

The first completed slice (`autoBattle`) and the frame counter provide concrete
examples. See:

- `src/state/reactive-context.js`
- `src/state/slices/auto-battle.js`
- `src/state/slices/frame-count.js`
- `src/services/world-service.js` (auto-battle & frame count integration)
- `src/services/battle-service.js` (UI subscription example)
- Tests: `test/reactive-context.test.js`, `test/world-service.test.js`,
  `test/battle-service.test.js`
- `src/state/slices/inventory.js` / world-service inventory & cash wiring
  (see tests `test/inventory-slice.test.js`, `test/world-service.test.js`).

## 1. Define a slice wrapper

1. Create a file under `src/state/slices/` (e.g. `something.js`).
2. Use `reactiveContext.ensureSignal` to expose a `signal` and a `BehaviorSubject`
   (via `reactiveContext.createBehaviorStream`). This gives us:
   - `fooSignal()` – returns a `Signal<T>`
   - `fooStream()` – RxJS stream for orchestrating non-UI systems
   - `updateFoo(value, { emitEvent = true, source })` – central mutation helper
3. Publish meaningful root events via `reactiveContext.rootEvent$` so non-slice
   code can listen in (e.g. debugging overlays).

See `auto-battle.js` for the template with debounced event emission and
behaviour when the value does not actually change.

## 2. Bridge the slice inside `worldService`

1. Import the slice helpers (`updateFoo`, `getFooValue`).
2. Update the corresponding getters/setters in `worldService` to forward through
   the slice:
   ```js
   getAutoBattle() {
     return getAutoBattleValue(this._getBooleanGlobal('autoBattle', false));
   }

   setAutoBattle(value) {
     const resolved = this._setBooleanGlobal('autoBattle', value);
     updateAutoBattle(resolved, { source: 'worldService' });
     return resolved;
   }
   ```
3. Ensure `syncAll()` calls `syncReactiveGlobals()` so the initial signal state
   matches the legacy global store.
4. Extend `_handleGlobalChanged` to call `_syncFoo(value)` whenever the legacy
   key is mutated elsewhere (script ops, tests, etc.). This keeps fallback code
   working until everything is ported.

## 3. Update downstream consumers

1. Prefer `fooSignal()` when the consumer is a UI module (fine-grained
   subscription) or `fooStream()` for services/systems that need to react inside
   generators.
2. For hybrid modules (e.g. `battle-service`), subscribe once and re-run the
   existing sync code:
   ```js
   this._autoBattleSubscription = autoBattleStream().subscribe(() => {
     this.syncUIComponent();
   });
   ```
   Remember to manage subscription lifecycle; the current pattern unsubscribes
   before re-subscribing in `_ensureAutoBattleSubscription()`.
3. Avoid reading `Global.*` directly once the slice exists. Instead call the
   new getter (`worldService.getAutoBattle()`) or use the signal/stream.

## 4. Tests and safety nets

For every migrated slice add targeted coverage:

- A slice-level test verifying the reactive context behaviour
  (`test/reactive-context.test.js` shows the expected API surface).
- World-service tests that assert:
  - Setters update both the legacy global store and the signal/stream.
  - Legacy mutations (via `stateService.setGlobal`) are mirrored into the slice
    (`_handleGlobalChanged` path).
- Consumer tests that prove subscribers observe the change (see
  `test/battle-service.test.js` for UI `autoBattle` updates).

These tests catch regressions early as more modules adopt the reactive layer.

## 5. Checklist before migrating another domain

1. Identify the legacy keys and helpers that read/write the state.
2. Add a slice file mirroring the `autoBattle` pattern.
3. Bridge the slice in `worldService` (getters/setters + `_handleGlobalChanged`
   + `syncReactiveGlobals()`).
4. Refactor consumers to subscribe to the slice instead of polling globals.
5. Add or update tests to lock behaviour.

Once these steps are complete you can safely remove ad-hoc proxy helpers
(`setGlobalValue`, `mutateGlobalEntry`, etc.) for that domain.

### Adapter reference updates

- **Battle state** – `src/services/battle-state-adapter.js` now exposes
  `getBattleStateSnapshot()` and `subscribeBattleState(listener)`. UI modules
  (`fight.js`, `battle.js`, `uibattle.js`, `script.js`, `text.js`) subscribe
  once and dispose via the adapter-provided unsubscribe to avoid touching
  `worldService.getBattleState()`.
- **Game data (level-up EXP)** – `src/services/game-data-adapter.js`
  introduces `getLevelUpExpValue(level)` / `getLevelUpExpTable()`. Menu /
  status screens consume these instead of probing `worldService.getLevelUpExp`.
- **Game data tables (magic, stores, enemies, battle effects, level-up magic)** –
  `src/services/game-data-adapter.js` now owns `getMagicEntry()`,
  `getStoreEntry()`, `getEnemyEntry()`, `getBattleEffectIndexRow()`, and
  `getLevelUpMagicTable()`. UI modules (`magicmenu.js`, `uigame.js`,
  `uibattle.js`, `fight.js`, `battle.js`, `script.js`) subscribe through the
  adapter so the legacy `worldService` getters can be retired.
- **Script entries / object descriptions** – `src/services/script-object-adapter.js`
  refreshes caches via `worldService.syncScriptRegisters()` / `syncObjectStores()`,
  allowing scripts to resolve entries without calling `worldService.getScriptEntry`
  or `getObjectDescTable`.
- **Scene event objects** – `src/services/scene-event-adapter.js` exposes
  snapshots (`getEventObjects()`, `getEventObjectsVersion()`, etc.) so UI/runtime
  modules (`play.js`, `scene.js`, `script.js`, ECS render/collision systems) no
  longer read `worldService.getEventObject*` directly.
  Typical subscription flow:

  ```js
  import sceneEventAdapter from '../services/scene-event-adapter.js';

  const unsubscribe = sceneEventAdapter.subscribe((event) => {
    switch (event.type) {
      case 'snapshot':
        renderScene(event.eventObjects);
        break;
      case 'eventObjects':
        renderScene(event.value);
        break;
      case 'collisionState':
        updateCollisionOverlay(event.value);
        break;
      default:
        break;
    }
  });

  // Later, when the owning module is disposed:
  unsubscribe();
  ```

  When invoking ECS pipelines, pass the latest `sceneEventAdapter.getEventObjects()`
  (see `scene.js` for reference) so systems do not fall back to `worldService`.
- **Cash & inventory** – world-service setters keep the legacy globals and the
  inventory slice in sync, but reads now come from the slice (`inventorySignals`
  in `game.js`, `magicmenu.js`, `script.js`, etc.). Tests asserting cash changes
  should read via `getCashValue()` rather than `worldService.getCash()`.

## 6. Future work

- Expose helper adapters (e.g. `useSignal(signal)` hooks) for the forthcoming
  React/TypeScript UI.
- Move additional buses (`battleBus$`, `sceneBus$`) into service code as we
  migrate cut-scene orchestration and map systems.
- Document event semantics in `reactiveContext` once more slices leverage them.

Following this playbook lets the remaining PAL subsystems migrate incrementally
without breaking existing RequireJS modules.
