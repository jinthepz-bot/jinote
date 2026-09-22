// Local export/import: one JSON file holding everything the app stores, so the
// user can back up or move devices without an account, a server or a login.
import { getThemeState, importTheme } from '../design/accent';
import { getCoachState, importCoachState, type CoachState } from '../coach/store';
import { getNotesState, importNotes } from '../notes/store';
import { getNotificationPrefs, importNotificationPrefs } from '../notifications/store';
import { getProfileState, importProfile } from '../profile/store';
import { getCalendarPrefs, importCalendarPrefs } from '../schedule/calendar/viewStore';
import { getScheduleState, importSchedule } from '../schedule/store';

export const BACKUP_APP = 'jinote';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: string;
  version: number;
  exportedAt: string; // ISO timestamp, for the reader's benefit
  data: {
    coach: unknown;
    notes: unknown;
    schedule: unknown;
    notifications: unknown;
    theme: unknown;
    profile: unknown;
    calendar: unknown;
  };
}

export interface BackupCounts {
  goals: number;
  entries: number;
  tasks: number;
  toBuy: number;
  notes: number;
  events: number;
}

export function countsOf(coach: CoachState, notes: number, events: number): BackupCounts {
  return {
    goals: coach.goals.length,
    entries: coach.entries.length,
    tasks: coach.tasks.length,
    toBuy: coach.toBuy.length,
    notes,
    events,
  };
}

export function currentCounts(): BackupCounts {
  return countsOf(getCoachState(), getNotesState().notes.length, getScheduleState().events.length);
}

// A recipe photo lives as a file on this device and is referenced by path, so the
// path travels but the image itself doesn't — see the note shown in Settings.
export function buildBackup(): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      coach: getCoachState(),
      notes: getNotesState(),
      schedule: getScheduleState(),
      notifications: getNotificationPrefs(),
      theme: getThemeState(),
      profile: getProfileState(),
      calendar: getCalendarPrefs(),
    },
  };
}

export function backupFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `jinote-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export type ParseResult = { ok: true; backup: Backup; counts: BackupCounts } | { ok: false; error: string };

// Reads a file the user picked. It might be any JSON at all — or not JSON — so this
// only reports what it can prove, and leaves the per-section validation to the
// stores' own normalizers at apply time.
export function parseBackup(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, error: "That file isn't a Jinote backup." };

  const obj = parsed as Record<string, unknown>;
  if (obj.app !== BACKUP_APP) return { ok: false, error: "That file isn't a Jinote backup." };
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    return { ok: false, error: 'That backup was made by a newer version of the app.' };
  }
  const data = (typeof obj.data === 'object' && obj.data !== null ? obj.data : {}) as Record<string, unknown>;

  const coach = data.coach as CoachState | undefined;
  const notes = (data.notes as { notes?: unknown[] } | undefined)?.notes;
  const events = (data.schedule as { events?: unknown[] } | undefined)?.events;

  const backup: Backup = {
    app: BACKUP_APP,
    version: obj.version,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
    data: {
      coach: data.coach,
      notes: data.notes,
      schedule: data.schedule,
      notifications: data.notifications,
      theme: data.theme,
      profile: data.profile, // absent in backups made before the name existed
      calendar: data.calendar,
    },
  };

  return {
    ok: true,
    backup,
    counts: {
      goals: Array.isArray(coach?.goals) ? coach.goals.length : 0,
      entries: Array.isArray(coach?.entries) ? coach.entries.length : 0,
      tasks: Array.isArray(coach?.tasks) ? coach.tasks.length : 0,
      toBuy: Array.isArray(coach?.toBuy) ? coach.toBuy.length : 0,
      notes: Array.isArray(notes) ? notes.length : 0,
      events: Array.isArray(events) ? events.length : 0,
    },
  };
}

// Replaces everything. Each store re-validates its own slice, so a hand-edited or
// partial file can't write junk into the app — missing sections come back empty.
export function applyBackup(backup: Backup) {
  importCoachState(backup.data.coach);
  importNotes(backup.data.notes);
  importSchedule(backup.data.schedule);
  importNotificationPrefs(backup.data.notifications);
  importTheme(backup.data.theme);
  importProfile(backup.data.profile);
  importCalendarPrefs(backup.data.calendar);
}

export function describeCounts(counts: BackupCounts): string {
  const parts = [
    `${counts.goals} ${counts.goals === 1 ? 'goal' : 'goals'}`,
    `${counts.entries} ${counts.entries === 1 ? 'log' : 'logs'}`,
    `${counts.tasks} ${counts.tasks === 1 ? 'task' : 'tasks'}`,
    `${counts.notes} ${counts.notes === 1 ? 'note' : 'notes'}`,
    `${counts.events} ${counts.events === 1 ? 'event' : 'events'}`,
  ];
  if (counts.toBuy > 0) parts.push(`${counts.toBuy} to buy`);
  return parts.join(' · ');
}
