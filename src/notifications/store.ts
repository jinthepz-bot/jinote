import { createPersistedStore } from '../storage/persistedStore';
import { isTimeKey } from '../schedule/time';

// No dependency on expo-notifications here, on purpose — see notifications/scheduler.ts.
// This store only holds what the user chose; whether those choices can actually fire a
// notification (OS permission) is checked separately at schedule time.
export interface NotificationPrefs {
  enabled: boolean; // one switch: off means nothing is ever scheduled, whatever the flags below say
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // "HH:MM", local time
  streakAtRiskEnabled: boolean;
  scheduleRemindersEnabled: boolean; // per-event lead time lives on the event itself, see schedule/store.ts
  deadlineWarningsEnabled: boolean;
}

const KEY = 'jinesist.notifications.v1';
const DEFAULT_DAILY_TIME = '19:00';

function normalize(raw: unknown): NotificationPrefs {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    enabled: obj.enabled !== false,
    dailyReminderEnabled: obj.dailyReminderEnabled === true,
    dailyReminderTime: isTimeKey(obj.dailyReminderTime) ? (obj.dailyReminderTime as string) : DEFAULT_DAILY_TIME,
    streakAtRiskEnabled: obj.streakAtRiskEnabled === true,
    scheduleRemindersEnabled: obj.scheduleRemindersEnabled === true,
    deadlineWarningsEnabled: obj.deadlineWarningsEnabled === true,
  };
}

// Every flag starts off, so nothing is scheduled and permission is never requested at launch.
const initial: NotificationPrefs = normalize({});

const store = createPersistedStore<NotificationPrefs>({
  key: KEY,
  initial,
  normalize,
  label: 'notification settings',
});

export const notificationPrefsReady = store.ready;

// Replaces everything from a backup file, through the same validation as a load.
export function importNotificationPrefs(raw: unknown) {
  store.set(normalize(raw));
}
export const getNotificationPrefs = store.get;
export const useNotificationPrefs = () => store.useStore();

export function setNotificationsEnabled(enabled: boolean) {
  store.update((s) => ({ ...s, enabled }));
}

export function setDailyReminderEnabled(enabled: boolean) {
  store.update((s) => ({ ...s, dailyReminderEnabled: enabled }));
}

export function setDailyReminderTime(time: string) {
  if (!isTimeKey(time)) return;
  store.update((s) => ({ ...s, dailyReminderTime: time }));
}

export function setStreakAtRiskEnabled(enabled: boolean) {
  store.update((s) => ({ ...s, streakAtRiskEnabled: enabled }));
}

export function setScheduleRemindersEnabled(enabled: boolean) {
  store.update((s) => ({ ...s, scheduleRemindersEnabled: enabled }));
}

export function setDeadlineWarningsEnabled(enabled: boolean) {
  store.update((s) => ({ ...s, deadlineWarningsEnabled: enabled }));
}
