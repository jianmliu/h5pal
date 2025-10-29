import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import partyTrailAdapter from '../src/services/party-trail-adapter.js';
import worldService from '../src/services/world-service.js';
import reactiveContext from '../src/state/reactive-context.js';
import stateService from '../src/services/state-service.js';

function createTrailEntry() {
  return { x: 10, y: 20, direction: 0 };
}

describe('partyTrailAdapter', () => {
  beforeEach(() => {
    reactiveContext.dispose();
    partyTrailAdapter.dispose();
    worldService.dispose();

    globalThis.PAL_X = (pos) => pos & 0xFFFF;
    globalThis.PAL_Y = (pos) => (pos >>> 16) & 0xFFFF;
    globalThis.PAL_XY = (x, y) => ((y & 0xFFFF) << 16) | (x & 0xFFFF);
    globalThis.Direction = {
      South: 0,
      West: 1,
      North: 2,
      East: 3,
      Unknown: 4
    };

    globalThis.Global = {
      viewport: PAL_XY(16, 32),
      partyOffset: PAL_XY(0, 0),
      party: [
        { playerRole: 0, x: 0, y: 0, frame: 0 },
        { playerRole: 1, x: 0, y: 0, frame: 0 }
      ],
      trail: [
        createTrailEntry(),
        createTrailEntry(),
        createTrailEntry(),
        createTrailEntry()
      ],
      numFollower: 1,
      maxPartyMemberIndex: 1,
      partyDirection: 0,
      autoBattle: false,
      frameNum: 0,
      inventory: [],
      cash: 0,
      lastUnequippedItem: 0,
      curMainMenuItem: 0,
      curSystemMenuItem: 0,
      curInvMenuItem: 0,
      noMusic: false,
      noSound: false
    };

    globalThis.GameData = {
      eventObject: [
        { state: 1, triggerMode: 0, spriteNum: 0 }
      ],
      scene: [
        { eventObjectIndex: 0, mapNum: 0, scriptOnEnter: 0 }
      ],
      map: [
        { metadata: { name: 'map0' } }
      ],
      object: []
    };
  });

  afterEach(() => {
    partyTrailAdapter.dispose();
    worldService.dispose();
    reactiveContext.dispose();
    stateService.updateGlobal({});
  });

  it('returns cached party, trail, and follower state that track worldService updates', () => {
    expect(partyTrailAdapter.getPartyState()[0].playerRole).toBe(0);
    expect(partyTrailAdapter.getTrailState()[0].x).toBe(10);
    expect(partyTrailAdapter.getFollowerCount()).toBe(1);

    worldService.mutateParty((party) => {
      if (party[0]) {
        party[0].playerRole = 3;
      }
      return party;
    });
    expect(partyTrailAdapter.getPartyState()[0].playerRole).toBe(3);

    worldService.mutateTrail((trail) => {
      if (Array.isArray(trail) && trail[0]) {
        trail[0].x = 128;
      }
      return trail;
    });
    expect(partyTrailAdapter.getTrailState()[0].x).toBe(128);

    worldService.setFollowerCount(4);
    expect(partyTrailAdapter.getFollowerCount()).toBe(4);
  });

  it('notifies subscribers with snapshots and subsequent changes', () => {
    const events = [];
    const unsubscribe = partyTrailAdapter.subscribe((event) => {
      events.push(event);
    });

    expect(events[0].type).toBe('snapshot');
    expect(events[0].party.length).toBe(2);

    worldService.setFollowerCount(2);
    worldService.setPartyStruct([
      { playerRole: 5, x: 0, y: 0, frame: 0 }
    ]);

    const followerEvent = events.find((event) => event.type === 'followerCount');
    expect(followerEvent.value).toBe(2);

    const partyEvent = events.find((event) => event.type === 'party');
    expect(partyEvent.value[0].playerRole).toBe(5);

    partyTrailAdapter.dispose();
    expect(events[events.length - 1].type).toBe('disposed');

    unsubscribe();
  });
});
