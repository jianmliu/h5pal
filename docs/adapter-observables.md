# Adapter Observables Contract

## Overview

The adapter layer exposes a consistent surface that lets external systems (ECS pipelines, NPC AI, on-chain bridges, diagnostics) observe PAL runtime state without touching legacy globals. Every adapter now publishes both a synchronous getter and a hot observable:

- `get<Name>Value()` (or equivalent snapshot helper) returns the latest value immediately.
- `<name>$()` returns a hot observable created via `createAdapterObservable`. The returned function also provides `.asObservable()`, `.subscribe()`, and `.getValue()` helpers.
- All streams are backed by RxJS `BehaviorSubject`s, so subscribers always receive an initial snapshot synchronously.

## Shared helper

`src/services/adapter-helpers.js` centralises creation of adapter observables. It memoises the underlying stream, enforces naming and exposes a getter hook:

```js
import { createAdapterObservable } from '../services/adapter-helpers.js';

const fooSignal = fooSlice.foo;

export const foo$ = createAdapterObservable({
  name: 'foo.bar',
  signal: fooSignal,
  getValue: () => normalise(fooSignal.value)
});

// Consumers can pick any of these entry points:
foo$().subscribe(listener);
foo$.asObservable().subscribe(listener);
const snapshot = foo$.getValue();
```

## Subscription semantics

- Streams are **hot** and shared. No new subject is created per subscriber.
- First emission happens synchronously on subscription.
- Most streams never complete. Streams tied to finite lifetimes (battle/scene event adapters) complete when the adapter disposes.
- Always unsubscribe when finished to avoid keeping listeners alive.
- Diagnostics (`debugUtils.getReactiveDiagnostics()`) will list each stream by its `name` so you can confirm connectivity.

## Naming conventions

| Element              | Pattern                | Example                     |
| -------------------- | ---------------------- | --------------------------- |
| Getter               | `get<Name>Value()`     | `getViewportValue()`        |
| Observable factory   | `<camelName>$()`       | `partyOffset$()`            |
| Diagnostic label     | `namespace.key`        | `environment.viewport`      |
| Module export        | Default export re-exports both getter and observable |

## Adapter reference

Payloads refer to existing PAL domain structs (`PAL_XY`, `BattleState`, etc.). Treat emitted objects as immutable snapshots.

### Environment (`src/services/environment-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getViewportValue()` | `viewport$()` | `number` (packed `PAL_XY`) | Camera origin in map coordinates. |
| `getPartyOffsetValue()` | `partyOffset$()` | `number` (packed `PAL_XY`) | Relative hero offset inside viewport. |
| `getPartyDirectionValue()` | `partyDirection$()` | `Direction` enum numeric | Facing for party leader. |
| `getCurrentSaveSlotValue()` | `currentSaveSlot$()` | `number` | Active save slot (defaults to `1`). |
| `getPaletteIdValue()` | `paletteId$()` | `number` | Palette entry requested by renderer. |
| `getScreenWaveValue()` | `screenWave$()` | `number` | Water-wave strength. |
| `getLayerValue()` | `layer$()` | `number` | Current z-layer offset for sprites. |
| `isNightPaletteEnabled()` | `nightPalette$()` | `boolean` | Night palette flag (normalised to boolean). |
| `shouldFadeIn()` | `fadeIn$()` | `boolean` | Fade flag for scene transitions. |
| `getWaveProgressionValue()` | `waveProgression$()` | `number` | Screen-wave phase accumulator. |

### Party trail (`src/services/party-trail-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getPartyState()` / `getPartyStateValue()` | `party$()` | `Array<PartyMemberState>` | Each member `{ playerRole, x, y, frame, imageOffset }`. |
| `getTrailState()` / `getTrailStateValue()` | `trail$()` | `Array<TrailEntry>` | Trail entries `{ x, y, direction }`. |
| `getFollowerCount()` / `getFollowerCountValue()` | `followerCount$()` | `number` | Followers queued behind the party. |

### Player state (`src/services/player-state-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getPlayerRolesSnapshot()` | `playerRoles$()` | `PlayerRoles` struct | Full player role data (HP/MP/level/etc.). |
| `getEquipmentEffectsMatrix()` | `equipmentEffects$()` | `Array<EquipmentEffect>` | Equipment effect matrix from DATA.MKF. |
| `getPlayerStatusMatrix()` | `playerStatus$()` | `Array<PlayerStatusRow>` | Status matrix emitted by battle systems. |
| `getPoisonStatusMatrix()` | `poisonStatus$()` | `Array<PoisonStatusRow>` | Per-role poison effects. |
| `getMaxPartyMemberIndex()` | `maxPartyIndex$()` | `number` | Highest active party slot (`-1` when empty). |

### Battle flags (`src/services/battle-flags-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getFlags()` / `getFlagsValue()` | `flags$()` | `{ repeat, force, flee, result, phase }` | Emits snapshot on every change; completes when adapter disposes. |

### Battle state (`src/services/battle-state-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getEnemyTeamValue()` | `enemyTeam$()` | `Array<EnemyTeamEntry>` | Enemy formations (empty array if unseeded). |
| `getBattleFieldsValue()` | `battleFields$()` | `Array<BattleFieldEntry>` | Battlefield metadata. |
| `getBattleFieldId()` | `battleFieldId$()` | `number` | Current battlefield id. |
| `getBattleMusicTrack()` | `battleMusicTrack$()` | `number` | Music index played during fights. |
| `getMusicTrack()` | `musicTrack$()` | `number` | Overworld music index. |
| `isAutoBattleEnabled()` | `autoBattle$()` | `boolean` | Mirrors auto-battle toggle. |
| `getBattleStateSnapshot()` | `battleState$()` | `BattleState` proxy | Live state object (treat as read-only). |

Additional helpers (`getEnemyTeamEntry`, `getBattleFieldEntry`, etc.) remain available for targeted lookups.

### Scene state & data

#### Scene state (`src/services/scene-state-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getSceneIdValue()` | `sceneId$()` | `number` | Active scene id (`0` during transitions). |

#### Scene data (`src/services/scene-data-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getSceneTable()` / `getSceneTableValue()` | `sceneTable$()` | `Array<SceneEntry>` | Metadata for scenes and their event slots. |
| `getSceneEntry(sceneId)` | — | `SceneEntry|null` | Direct lookup helper. |
| `getSceneEventObjectRange(sceneId)` | — | `{ start, end, count }` | Derived range, no observable yet. |

#### Scene events (`src/services/scene-event-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getSceneId()` / `getSceneIdValue()` | `sceneId$()` | `number` | Mirrors scene id within the event adapter. |
| `getEventObjects()` / `getEventObjectsValue()` | `sceneEventObjects$()` | `Array<EventObjectEntry>` | Entries `{ id, index, state }`; state mirrors the PAL struct. |
| `getCollisionState()` / `getCollisionStateValue()` | `collisionState$()` | `CollisionState` snapshot | Data for collision queries. |
| `getEventObjectsVersion()` | `sceneEventVersion$()` | `number` | Monotonic counter incremented on mutation. |

### Game flags (`src/services/game-flags-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getCollectValue()` | `collect$()` | `number` | Misc game flag toggled by scripts. |
| `getChaseRange()` | `chaseRange$()` | `number` | NPC chase radius. |
| `getChaseSpeedChangeCycles()` | `chaseSpeedChangeCycles$()` | `number` | Frames until chase speed resets. |
| `getBattleSpeed()` | `battleSpeed$()` | `number` | 1–5 setting from system menu. |

### Game data (`src/services/game-data-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getMagicTableValue()` | `magicTable$()` | `Array<MagicEntry>` | Raw magic definitions. |
| `getStoreTableValue()` | `storeTable$()` | `Array<StoreEntry>` | Shop inventories. |
| `getEnemyTableValue()` | `enemyTable$()` | `Array<EnemyEntry>` | Enemy stats table. |
| `getBattleEffectsValue()` | `battleEffects$()` | `Array<BattleEffectEntry>` | Effect-to-animation mapping. |
| `getExpStateSnapshot()` | `expState$()` | `ExpState` struct | Experience matrices per hero. |
| `getLevelUpExpTable()` | `levelUpExp$()` | `Array<number>` | XP requirements per level. |
| `getLevelUpMagicTable()` | `levelUpMagic$()` | `Array<LevelUpMagicEntry>` | Magic unlocks per level. |

### Script objects (`src/services/script-object-adapter.js`)

| Getter | Observable | Type | Notes |
| --- | --- | --- | --- |
| `getScriptEntries()` / `getScriptEntriesValue()` | `scriptEntries$()` | `Array<ScriptEntry>` | Script instruction table used by the VM. |
| `getObjectTable()` / `getObjectTableValue()` | `objectTable$()` | `Array<ObjectUnion>` | General-purpose object metadata. |
| `getObjectDesc()` / `getObjectDescValue()` | `objectDesc$()` | `Array<ObjectDesc>` `null` | Text descriptions loaded from `desc.dat`. |

## Special considerations

- **Immutability:** Treat emitted arrays/objects as read-only. Clone values before mutating in downstream code.
- **Fallbacks:** Some getters still consult `worldService` while slices migrate. These paths will disappear over time but they guarantee a value today.
- **Completion:** Only `battleFlags$` and the scene-event streams complete when their adapters tear down. Others emit indefinitely.
- **Diagnostics:** The debug overlay’s Rx panel lists each stream using the `name` supplied to `createAdapterObservable`.

## Adding new observables

1. Normalise the synchronous getter (`getFooValue`).
2. Call `createAdapterObservable({ name: 'namespace.foo', signal, getValue })` and export the function.
3. Re-export both getter and observable from the adapter’s default export.
4. Update this document so downstream consumers have an authoritative spec.

## Testing

Vitest covers the existing streams (`test/adapter-observable.test.js`, `test/battle-state-adapter.test.js`, etc.). When adding new observables, mirror those patterns to verify initial emissions, change propagation, and disposal behaviour.

## Roadmap

- Extend `save-data-adapter` with observable surfaces once the save-game slice migrates fully.
- Provide typed payload definitions (TypeScript or JSON schemas) so tooling can generate clients automatically.
- Build higher-level ECS feeds on top of these primitives for NPC AI and on-chain event mirroring.

With this contract in place, downstream systems can rely on a stable set of adapter observables without touching legacy globals.
