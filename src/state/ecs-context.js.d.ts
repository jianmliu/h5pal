export function writeDialogState(patch: Record<string, unknown>): void;
export function writePlayerState(patch: {
  x?: number | null;
  y?: number | null;
  direction?: number | null;
  followers?: number | null;
}): void;
