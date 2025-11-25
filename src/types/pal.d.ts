export interface PalConfig {
  assetBaseUrl: string;
  audioBaseUrl: string | null;
  enableTouch: boolean;
  enableAudio: boolean;
  enableModAssets: boolean;
  modAssetBaseUrl: string;
  modSpriteBaseUrl: string;
  enableOverviewMode: boolean;
  enablePanorama: boolean;
  mapOverlayMode: 'gps' | 'panorama' | 'off' | string;
  showEventObjectLabels: boolean;
  enableAIControl: boolean;
  enableNPCBehaviours: boolean;
  enableMud: boolean;
  embeddingSource: string;
  embeddingModel: string;
  llmModel: string | null;
  resolveAssetPath(path: string): string;
  resolveAudioPath(path: string): string | null;
  resolveModAssetPath(path: string): string | null;
  resolveModSpritePath(path: string): string | null;
  resolveAssetPathCandidates(path: string): string[];
  resolveAudioPathCandidates(path: string): string[];
}

export type PartialPalConfig = Partial<PalConfig>;

export interface BattleActionTypeMap {
  Pass: number;
  Defend: number;
  Attack: number;
  Magic: number;
  CoopMagic: number;
  Flee: number;
  ThrowItem: number;
  UseItem: number;
  AttackMate: number;
}

export interface BattleResultMap {
  Won: number;
  Lost: number;
  Fleed: number;
  Terminated: number;
  OnGoing: number;
  PreBattle: number;
  Pause: number;
}

export interface FighterStateMap {
  Wait: number;
  Com: number;
  Act: number;
}

export interface PalGlobal {
  battle?: { __raw__?: unknown } & Record<string, unknown>;
  party?: Record<string, unknown>[] | null;
  trail?: Record<string, unknown>[] | null;
  exp?: Record<string, unknown> | null;
  playerRoles?: PlayerRoles | null;
  numFollower?: number | null;
  [key: string]: unknown;
}

export interface PlayerRoles {
  name?: number[];
  level?: number[];
  HP?: number[];
  maxHP?: number[];
  MP?: number[];
  maxMP?: number[];
  attackStrength?: number[];
  magicStrength?: number[];
  defense?: number[];
  dexterity?: number[];
  fleeRate?: number[];
  spriteNumInBattle?: number[];
  [key: string]: unknown;
}

type MagicEntry = Record<string, unknown>;
type StoreEntry = Record<string, unknown>;
type EnemyEntry = Record<string, unknown>;
type BattleEffectEntry = Record<string, unknown>;
type LevelUpMagicEntry = Record<string, unknown>;

export interface PalGameData {
  playerRoles?: PlayerRoles | null;
  levelUpExp?: number[] | null;
  levelUpMagic?: LevelUpMagicEntry[] | null;
  enemy?: EnemyEntry[] | null;
  object?: Record<string, unknown>[] | null;
  magic?: MagicEntry[] | null;
  eventObject?: Record<string, unknown>[] | null;
  scenes?: Record<string, unknown>[] | null;
  battleEffectIndex?: BattleEffectEntry[] | null;
  store?: StoreEntry[] | null;
  battleEffects?: BattleEffectEntry[] | null;
  [key: string]: unknown;
}

declare global {
  interface Window {
    PAL_CONFIG?: PartialPalConfig;
    PAL_DEBUG?: { traceModules?: boolean };
    PAL_OVERLAY_ACTIVE?: 'panorama' | 'off' | string;
    PAL_OVERLAY_PREFERENCE?: 'panorama' | 'off' | string;
    PAL_OVERLAY_SUSPENDED?: boolean;
    PAL_SET_OVERLAY_MODE?: (mode: 'panorama' | 'off' | string) => void;
    __PAL_CLASSIC_OVERLAY__?: { depth: number; shouldRestore: boolean };
  }

  const PAL_CONFIG: PartialPalConfig | undefined;

  const PAL_DEBUG: { traceModules?: boolean } | undefined;

  // Core globals defined in common.js
  var DEBUG: { Timing?: boolean; ShowSpriteRect?: boolean; ShowSpritePos?: boolean; ShowSpriteSize?: boolean };
  var log: any;
  var LogLevel: any;
  var GameSpeed: number;
  var RECT: any;
  var BinaryReader: any;
  var LittleEndian: any;
  var process: any;
  function hrtime(): number;
  function sprintf(format: string, ...args: any[]): string;
  type int = number;
  type POS = number;

  // Common PAL helpers (declared in common.js)
  function PAL_XY(x: number, y: number): number;
  function PAL_YX(y: number, x: number): number;
  function PAL_X(yx: number): number;
  function PAL_Y(yx: number): number;
  function PAL_XYH_TO_POS(x: number, y: number, h: number): number;
  function PAL_POS(x: number, y: number): number;

  // Game constants that show up in many modules; keep them loose for now.
  const TriggerMode: any;
  const BattleActionType: BattleActionTypeMap;
  const PlayerStatus: any;
  const PoisonStatus: any;
  const BattleResult: BattleResultMap;
  const FighterState: FighterStateMap;
  const BattleMenuState: any;
  const BattleUIState: any;
  const Files: any;
  const Const: any;
  const Direction: any;
  const DialogPosition: any;
  const RECT: any;
  const NumColor: any;
  const NumAlign: any;

  const GameData: PalGameData;
  const Global: PalGlobal;
  var GameData: PalGameData;
  var Global: PalGlobal;
  var BattleActionType: BattleActionTypeMap;


  const DEBUG: { Timing?: boolean; ShowSpriteRect?: boolean; ShowSpritePos?: boolean; ShowSpriteSize?: boolean };
  const LogLevel: any;
  const GameSpeed: number;
  const log: any;
  function sprintf(format: string, ...args: any[]): string;
  function hrtime(): number;
  var randomLong: ((min: number, max: number) => number) | undefined;
  type int = number;
  type POS = number;

  interface GlobalThis {
    GameData?: PalGameData;
    Global?: PalGlobal;
    BattleActionType?: BattleActionTypeMap;
  }

  interface Promise<T> {
    spread?<R>(this: Promise<any>, onfulfilled: (...args: any[]) => R, onrejected?: (reason: any) => any): Promise<R>;
  }

  interface Window {
    webkitRequestAnimationFrame?: typeof requestAnimationFrame;
    mozRequestAnimationFrame?: typeof requestAnimationFrame;
    oRequestAnimationFrame?: typeof requestAnimationFrame;
    webkitCancelAnimationFrame?: typeof cancelAnimationFrame;
    mozCancelAnimationFrame?: typeof cancelAnimationFrame;
    oCancelAnimationFrame?: typeof cancelAnimationFrame;
  }
  // Utility globals
  function sleep(ms: number): Promise<void>;
  function sleepByFrame(frame: number): Promise<void>;
  function randomFloat(min?: number, max?: number): number;
}

// Node/DOM hybrid helpers to calm down existing code.
interface MapConstructor {
  fromFile?(...args: any[]): Map<any, any>;
}

interface ArrayBufferView {
  length?: number;
  slice?(start?: number, end?: number): Uint8Array;
}

interface Require {
  s?: any;
}

// Minimal stub for rxjs to satisfy typecheck scope
declare module 'rxjs' { const anyValue: any; export = anyValue; }

declare module '../js/pal/ajax.js' {
  const ajax: any;
  export = ajax;
}


declare module '../js/pal/game.js' {
  const game: any;
  export = game;
}

declare module './world-service.js' {
  const worldService: any;
  export default worldService;
}

declare module './world-service.ts' {
  const worldService: any;
  export default worldService;
}
// Minimal stubs for adapters
class EventBus { fire?: (...args: any[]) => void; on?: any; off?: any; }
class StateService { fire?: (...args: any[]) => void; on?: any; off?: any; }
class StorageService { fire?: (...args: any[]) => void; }
class ScriptService extends EventBus { playerLevelUp?: (roleId: number, increment: number) => void; }

declare namespace NodeJS {
  interface Global {
    GameData?: PalGameData;
    Global?: PalGlobal;
    BattleActionType?: BattleActionTypeMap;
  }
}

export {};
