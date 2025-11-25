type DialogStatus = {
  active: boolean;
  awaitingInput: boolean;
  needsAdvance: boolean;
  lastUpdated: number | null;
  lastMsgId?: number | null;
  position?: number | null;
};

type DialogLine = {
  text: string;
  msgId: number | null;
  position: number | null;
  line: number | null;
  timestamp: number;
  scriptEntry: number | null;
  eventObjectId: number | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
};

type DialogChoiceOption = { value: unknown; label?: string | null };
type DialogChoice = {
  id?: number;
  options?: DialogChoiceOption[];
  selected?: number | null;
  label?: string | null;
  value?: unknown;
  eventObjectId?: number | null;
};

type Signal<T> = {
  value: T;
  subscribe?: (listener: (value: T) => void) => { unsubscribe?: () => void } | (() => void);
};

declare const dialogService: {
  signals: {
    currentLine: Signal<DialogLine | null>;
    history: Signal<DialogLine[]>;
    status: Signal<DialogStatus>;
    choice: Signal<DialogChoice | null>;
  };
  getCurrentLine?: () => DialogLine | null;
};
export default dialogService;
