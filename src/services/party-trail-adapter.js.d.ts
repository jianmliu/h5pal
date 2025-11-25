import type { PartyEntry, TrailEntry } from './world-service.js';

declare const partyTrailAdapter: {
  subscribe: (listener: (event: unknown) => void) => () => void;
  getPartyState: () => PartyEntry[];
  getTrailState: () => TrailEntry[];
  getPartyMember: (index: number) => PartyEntry | null;
  getFollowerCount: () => number;
  party$: { subscribe: (...args: any[]) => any; getValue?: () => PartyEntry[] };
  trail$: { subscribe: (...args: any[]) => any; getValue?: () => TrailEntry[] };
  followerCount$: { subscribe: (...args: any[]) => any; getValue?: () => number };
  dispose: () => void;
};
export default partyTrailAdapter;
