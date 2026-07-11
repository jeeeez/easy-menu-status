export const SETTINGS_ICON_MAX_INPUT_BYTES = 10 * 1024 * 1024;

export type SettingsIconImportRequest =
  | { source: 'picker' }
  | { source: 'clipboard' }
  | { source: 'path'; path: string }
  | {
      source: 'bytes';
      bytes: Uint8Array;
      fileName?: string;
      mimeType?: string;
    }
  | { source: 'url'; url: string };

export type SettingsIconImportResult =
  | { ok: true; fileName: string }
  | { ok: false; error: string; canceled?: boolean };

export type SettingsIconPreviewResult =
  | { ok: true; dataUrl: string; fallback?: false }
  | { ok: true; fallback: true }
  | { ok: false; error: string };

export interface SettingsLocalIcon {
  fileName: string;
  dataUrl?: string;
}

export type SettingsLocalIconListResult =
  | { ok: true; icons: SettingsLocalIcon[] }
  | { ok: false; error: string };

export type SettingsLocalIconDeleteResult =
  | { ok: true; fileName: string }
  | { ok: false; error: string; canceled?: boolean };

export type SettingsLocalIconRevealResult =
  | { ok: true; fileName: string }
  | { ok: false; error: string };
