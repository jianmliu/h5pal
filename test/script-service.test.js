import { beforeEach, describe, expect, it, vi } from 'vitest';

const runTriggerScript = vi.fn(function* (entry, eventObjectID) {
  yield 'inner-step';
  return entry + eventObjectID;
});

const scriptModuleMock = {
  runTriggerScript,
  scriptSuccess: true,
  value: 42
};

vi.mock('../src/js/pal/script.js', () => ({
  default: scriptModuleMock
}));

describe('ScriptService', () => {
  let scriptService;

  beforeEach(async () => {
    runTriggerScript.mockClear();
    scriptModuleMock.scriptSuccess = true;
    scriptModuleMock.value = 42;
    const module = await import('../src/services/script-service.js');
    scriptService = module.default;
    scriptService._events = {};
  });

  it('proxies module properties', () => {
    expect(scriptService.value).toBe(42);
    scriptService.value = 10;
    expect(scriptService.getModule().value).toBe(10);
  });

  it('wraps runTriggerScript and emits lifecycle events', () => {
    const beforeSpy = vi.fn();
    const afterSpy = vi.fn();
    scriptService.on('beforeRunTriggerScript', beforeSpy);
    scriptService.on('afterRunTriggerScript', afterSpy);

    const iterator = scriptService.runTriggerScript(5, 3);
    expect(beforeSpy).toHaveBeenCalledTimes(1);
    expect(beforeSpy.mock.calls[0][0]).toEqual({
      type: 'beforeRunTriggerScript',
      data: { scriptEntry: 5, eventObjectID: 3 }
    });

    const firstStep = iterator.next();
    expect(firstStep.value).toBe('inner-step');
    const result = iterator.next();
    expect(result.done).toBe(true);
    expect(result.value).toBe(8);

    expect(afterSpy).toHaveBeenCalledTimes(1);
    expect(afterSpy.mock.calls[0][0]).toEqual({
      type: 'afterRunTriggerScript',
      data: {
        scriptEntry: 5,
        eventObjectID: 3,
        nextEntry: 8,
        success: true
      }
    });
  });
});
