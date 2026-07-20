const EVENT_PREFIX = "vibegame:";

export type VibeGameEventName = "hud" | "feed" | "pickup" | "finish" | "pause";

export function emitGameEvent<T>(name: VibeGameEventName, detail: T): void {
  window.dispatchEvent(new CustomEvent(`${EVENT_PREFIX}${name}`, { detail }));
}

export function formatClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function displayKey(code: string): string {
  const labels: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    ShiftLeft: "Shift",
    ShiftRight: "Shift",
    Escape: "Esc",
    Space: "Space",
    Tab: "Tab",
  };
  return labels[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "");
}

