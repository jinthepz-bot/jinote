import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

interface Options<T> {
  key: string;
  initial: T;
  // Turns whatever was stored into valid state.
  normalize: (raw: unknown) => T;
  // Runs only when nothing is stored under `key` yet, e.g. to bring over data from an older key.
  migrate?: () => Promise<T | null>;
  // Used in warning messages.
  label: string;
}

export interface PersistedStore<T> {
  key: string;
  ready: Promise<void>;
  get: () => T;
  set: (next: T) => void;
  update: (fn: (state: T) => T) => void;
  // Turns any stored or received value into valid state (the same check a load runs).
  normalize: (raw: unknown) => T;
  // For code outside React (cloud sync): called after every change.
  subscribe: (listener: () => void) => () => void;
  useStore: () => { state: T; loaded: boolean };
}

// Every store by its storage key, so cloud sync (see sync/) can read, watch and
// update them without each store module knowing about it.
const registry = new Map<string, PersistedStore<unknown>>();

export function registeredStore(key: string): PersistedStore<unknown> | undefined {
  return registry.get(key);
}

// In-memory state mirrored to one AsyncStorage key, with a React hook.
export function createPersistedStore<T>({ key, initial, normalize, migrate, label }: Options<T>): PersistedStore<T> {
  let snapshot: { state: T; loaded: boolean } = { state: initial, loaded: false };
  const listeners = new Set<() => void>();
  let writeChain: Promise<void> = Promise.resolve();

  const emit = (state: T, loaded: boolean) => {
    snapshot = { state, loaded };
    listeners.forEach((l) => l());
  };

  // Writes are chained so an older snapshot never lands after a newer one.
  const write = (state: T) => {
    writeChain = writeChain
      .then(() => AsyncStorage.setItem(key, JSON.stringify(state)))
      .catch((err) => console.warn(`Failed to save ${label}`, err));
  };

  const ready = (async () => {
    let state = initial;
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw !== null) {
        state = normalize(JSON.parse(raw));
      } else if (migrate) {
        const migrated = await migrate();
        if (migrated) {
          state = migrated;
          write(state);
        }
      }
    } catch (err) {
      console.warn(`Failed to load ${label}`, err);
    }
    emit(state, true);
  })();

  const set = (next: T) => {
    emit(next, snapshot.loaded);
    write(next);
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const store: PersistedStore<T> = {
    key,
    ready,
    get: () => snapshot.state,
    set,
    update: (fn) => set(fn(snapshot.state)),
    normalize,
    subscribe,
    useStore: () => useSyncExternalStore(subscribe, () => snapshot),
  };
  registry.set(key, store as PersistedStore<unknown>);
  return store;
}
