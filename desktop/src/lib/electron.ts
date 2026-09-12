/** Typed access to the Electron bridge injected by preload.js (null in a browser). */

export interface NovaBridge {
  isElectron: true;
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  pickFolder(): Promise<string | null>;
  openPath(path: string): Promise<string>;
  revealPath(path: string): Promise<boolean>;
  setMinimizeToTray(value: boolean): void;
  setClipboardMonitor(value: boolean): void;
  onClipboardUrl(callback: (url: string) => void): void;
}

export function getNova(): NovaBridge | null {
  return (window as unknown as { nova?: NovaBridge }).nova ?? null;
}
