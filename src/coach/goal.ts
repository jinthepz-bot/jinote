// The main goal shown on Home. Not user-editable yet.
export const goal = {
  target: 100,
  unit: 'reps',
  mission: '100 push-ups in one unbroken set before the deadline. Show up every day.',
};

// "100 push-ups" -> "Push-ups": a goal's activity without its leading number, for
// labelling one session of it ("Push-ups · 25 reps") on Home and in the calendar.
export function goalActivityName(goalTitle: string): string {
  const name = goalTitle.replace(/^\d+(?:\.\d+)?\s+/, '').trim() || goalTitle;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
