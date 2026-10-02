import type { Mood } from './store';

// Fixed colours, not themed: a mood should look the same wherever it shows up.
export const MOODS: { value: Mood; label: string; color: string }[] = [
  { value: 1, label: 'Rough', color: '#A8322B' },
  { value: 2, label: 'Low', color: '#D08A5C' },
  { value: 3, label: 'Okay', color: '#D9C59A' },
  { value: 4, label: 'Good', color: '#8FAF7E' },
  { value: 5, label: 'Great', color: '#3E6B3A' },
];

export const moodOf = (mood: Mood) => MOODS[mood - 1];

// Rough and Great are dark enough for cream text on their squares; the rest take dark text.
export const moodOnDark = (mood: Mood) => mood === 1 || mood === 5;
