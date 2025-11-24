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

declare global {
  interface Window {
    PAL_CONFIG?: PartialPalConfig;
    PAL_DEBUG?: { traceModules?: boolean };
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
  const BattleActionType: any;
  const PlayerStatus: any;
  const PoisonStatus: any;
  const BattleResult: any;
  const FighterState: any;
  const BattleMenuState: any;
  const BattleUIState: any;
  const Files: any;
  const Const: any;
  const Direction: any;
  const DialogPosition: any;
  const RECT: any;
  const NumColor: any;
  const NumAlign: any;

  const GameData: any;
  const Global: any;
  var GameData: any;
  var Global: any;


  const DEBUG: { Timing?: boolean; ShowSpriteRect?: boolean; ShowSpritePos?: boolean; ShowSpriteSize?: boolean };
  const LogLevel: any;
  const GameSpeed: number;
  const log: any;
  function sprintf(format: string, ...args: any[]): string;
  function hrtime(): number;
  type int = number;
  type POS = number;

  interface GlobalThis {
    GameData?: any;
    Global?: any;
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

// Minimal stubs for adapters
class StateService { fire?: (...args: any[]) => void; on?: any; off?: any; }
class StorageService { fire?: (...args: any[]) => void; }

export {};
