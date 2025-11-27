import { describe, it, expect, afterEach } from 'vitest';
import dialogService from '../src/services/dialog-service.ts';
import { currentLine$, status$, choice$ } from '../src/services/dialog-adapter.ts';

describe('dialog adapter', () => {
  afterEach(() => {
    dialogService.clearDialog('test-reset');
    dialogService.publishChoice(null);
  });

  it('emits current line when dialogService publishes text', async () => {
    const seen = [];
    const subscription = currentLine$().subscribe((value) => {
      if (value && value.text) {
        seen.push(value.text);
      }
    });
    dialogService.publishLine({ text: '测试对白', msgId: 42 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen.at(-1)).toBe('测试对白');
    subscription.unsubscribe();
  });

  it('updates status when awaiting input toggles', async () => {
    const snapshots = [];
    const subscription = status$().subscribe((value) => {
      snapshots.push(value);
    });
    dialogService.setAwaitingInput(true, { position: 'Upper' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(snapshots.at(-1)?.awaitingInput).toBe(true);
    dialogService.setAwaitingInput(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(snapshots.at(-1)?.awaitingInput).toBe(false);
    subscription.unsubscribe();
  });

  it('emits choice resolution with labels when available', async () => {
    const events = [];
    const subscription = choice$().subscribe((value) => {
      if (value) {
        events.push(value);
      }
    });
    dialogService.publishChoice({
      type: 'inventory',
      options: [
        { label: 'Slot 1', value: 1 },
        { label: 'Slot 2', value: 2 }
      ],
      selectedIndex: 0
    });
    dialogService.resolveChoice(2, { selectedIndex: 1 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events.at(-1)?.resolvedLabel).toBe('Slot 2');
    subscription.unsubscribe();
  });
});
