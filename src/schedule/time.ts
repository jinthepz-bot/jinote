// Time-of-day, kept separate from any calendar day (see coach/days.ts): a 24-hour
// "HH:MM" string with no date attached, since a recurring class has no single date.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isTimeKey(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

// Filters typing in a time field to digits, auto-inserting the colon after 2 digits.
export function sanitizeTimeInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function compareTimes(a: string, b: string): number {
  return minutesOf(a) - minutesOf(b);
}

// 555 -> "09:15". Clamped to the day, so arithmetic can't produce "24:30".
export function timeFromMinutes(minutes: number): string {
  const m = Math.min(23 * 60 + 59, Math.max(0, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
