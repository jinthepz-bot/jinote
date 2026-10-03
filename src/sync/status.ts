import { useSyncExternalStore } from 'react';

// What the sync status line says. In memory only: it's about this session.
export type SyncPhase = 'off' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  email: string | null; // the signed-in account, null when signed out
  lastSyncedAt: number | null; // ms, the last time a full round finished
  message: string | null; // what went wrong, for 'error'
  pending: number; // local changes not uploaded yet
}

let status: SyncStatus = { phase: 'off', email: null, lastSyncedAt: null, message: null, pending: 0 };
const listeners = new Set<() => void>();

export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export const getSyncStatus = () => status;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribe, () => status);
}

// "Synced", "Syncing…", "Offline"… for the sidebar and Settings.
export function syncLabel(s: SyncStatus): string {
  switch (s.phase) {
    case 'off':
      return 'Sync off';
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return 'Synced';
    case 'offline':
      return 'Offline';
    case 'error':
      return 'Sync problem';
  }
}

export const SYNC_ICONS = {
  off: 'cloud-outline',
  syncing: 'sync-outline',
  synced: 'cloud-done-outline',
  offline: 'cloud-offline-outline',
  error: 'alert-circle-outline',
} as const;
