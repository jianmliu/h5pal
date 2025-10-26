import { beforeEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn(function* (...args) {
  yield { type: 'initStep', args };
  return undefined;
});

const startMock = vi.fn(function* (team, isBoss) {
  yield { type: 'startStep', team, isBoss };
  return 'BattleResult';
});

const wonMock = vi.fn(function* () {
  yield { type: 'wonStep' };
});

const playerEscapeMock = vi.fn(function* () {
  yield { type: 'playerEscapeStep' };
});

const enemyEscapeMock = vi.fn(function* () {
  yield { type: 'enemyEscapeStep' };
});

const battleModuleMock = {
  init: initMock,
  start: startMock,
  won: wonMock,
  playerEscape: playerEscapeMock,
  enemyEscape: enemyEscapeMock,
  value: 7
};

vi.mock('../src/js/pal/battle.js', () => ({
  default: battleModuleMock
}));

describe('BattleService', () => {
  let battleService;

  beforeEach(async () => {
    initMock.mockClear();
    startMock.mockClear();
    wonMock.mockClear();
    playerEscapeMock.mockClear();
    enemyEscapeMock.mockClear();
    const module = await import('../src/services/battle-service.js');
    battleService = module.default;
    battleService._events = {};
  });

  it('proxies module properties', () => {
    expect(battleService.value).toBe(7);
    battleService.value = 10;
    expect(battleService.getModule().value).toBe(10);
  });

  it('wraps init with lifecycle events', () => {
    const beforeSpy = vi.fn();
    const afterSpy = vi.fn();
    battleService.on('beforeInit', beforeSpy);
    battleService.on('afterInit', afterSpy);

    const iterator = battleService.init('surface');
    const firstStep = iterator.next();
    expect(beforeSpy).toHaveBeenCalledWith({
      type: 'beforeInit',
      data: { args: ['surface'] }
    });
    expect(firstStep.value).toEqual({ type: 'initStep', args: ['surface'] });
    const result = iterator.next();
    expect(result.done).toBe(true);
    expect(afterSpy).toHaveBeenCalledWith({
      type: 'afterInit',
      data: { args: ['surface'], result: undefined }
    });
  });

  it('wraps start and returns the underlying result', () => {
    const beforeSpy = vi.fn();
    const afterSpy = vi.fn();
    battleService.on('beforeStart', beforeSpy);
    battleService.on('afterStart', afterSpy);

    const iterator = battleService.start([1, 2], true);
    const firstStep = iterator.next();
    expect(beforeSpy).toHaveBeenCalledWith({
      type: 'beforeStart',
      data: { enemyTeam: [1, 2], isBoss: true }
    });
    expect(firstStep.value).toEqual({ type: 'startStep', team: [1, 2], isBoss: true });
    const result = iterator.next();
    expect(result.value).toBe('BattleResult');
    expect(afterSpy).toHaveBeenCalledWith({
      type: 'afterStart',
      data: { enemyTeam: [1, 2], isBoss: true, result: 'BattleResult' }
    });
  });

  it('exposes other generator helpers through the proxy', () => {
    const wonIterator = battleService.won();
    expect(wonIterator.next().value).toEqual({ type: 'wonStep' });
    wonIterator.next();

    const escapeIterator = battleService.playerEscape();
    expect(escapeIterator.next().value).toEqual({ type: 'playerEscapeStep' });
    escapeIterator.next();

    const enemyIterator = battleService.enemyEscape();
    expect(enemyIterator.next().value).toEqual({ type: 'enemyEscapeStep' });
    enemyIterator.next();
  });
});
