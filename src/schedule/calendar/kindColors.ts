import { colors, rgba } from '../../design/theme';
import type { CalendarKind } from './items';

export interface KindColors {
  background: string;
  backgroundHover: string; // the same tint, a little stronger
  border: string;
  text: string;
}

// A light tint of the kind's hue with dark text of the same hue, so a block reads as
// one colour. Tasks are the neutral one — they're the least "when"-ish thing here.
export function kindColors(kind: CalendarKind): KindColors {
  const of = (hue: string, alpha: number): KindColors => ({
    background: rgba(hue, alpha),
    backgroundHover: rgba(hue, alpha + 0.1),
    border: rgba(hue, 0.42),
    text: hue,
  });

  switch (kind) {
    case 'event':
      return of(colors.eventBlue, 0.14);
    case 'deadline':
      return of(colors.deadlineRed, 0.12);
    case 'session':
      return of(colors.goalGreen, 0.14);
    default:
      return {
        background: colors.surface2,
        backgroundHover: rgba(colors.text, 0.13),
        border: rgba(colors.text, 0.22), // stronger than the card border: this one sits on the page
        text: colors.text,
      };
  }
}

// The calendar's rules, dark enough to follow across a wide grid but still quiet.
// Built from the text colour rather than a fixed grey so they hold up on either theme.
export const gridLines = {
  hour: rgba(colors.text, 0.16),
  half: rgba(colors.text, 0.07),
};
