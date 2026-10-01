import { useMemo } from 'react';

import type { CoachScreen } from '../agent/screen';
import { addDays, daysInMonth, makeDayKey, parseDayKey, startOfWeek } from '../coach/days';
import { useNotes } from '../notes/store';
import { useCalendarView } from '../schedule/calendar/viewStore';
import { ChatScreen } from '../screens/ChatScreen';

// The desktop coach panel: the same chat as the phone's Chat tab, told which screen
// is showing beside it (and, on Schedule, which days; on a note page, which note).
export function CoachPanel({
  route,
  openNoteId,
  onCollapse,
}: {
  route: string;
  openNoteId: string | undefined;
  onCollapse: () => void;
}) {
  const { anchor, mode } = useCalendarView();
  const { state: notes } = useNotes();

  const screen = useMemo<CoachScreen>(() => {
    if (route === 'Schedule') {
      if (mode === 'day') return { screen: 'schedule', mode, from: anchor, to: anchor };
      if (mode === 'month') {
        const p = parseDayKey(anchor)!;
        return {
          screen: 'schedule',
          mode,
          from: makeDayKey(p.year, p.month, 1),
          to: makeDayKey(p.year, p.month, daysInMonth(p.year, p.month)),
        };
      }
      const from = startOfWeek(anchor);
      return { screen: 'schedule', mode: 'week', from, to: addDays(from, 6) };
    }
    if (route === 'Journal') {
      const note = openNoteId ? notes.notes.find((n) => n.id === openNoteId) : undefined;
      return note ? { screen: 'note', note } : { screen: 'journal' };
    }
    if (route === 'Goals') return { screen: 'goals' };
    return { screen: 'today' };
  }, [route, openNoteId, notes.notes, anchor, mode]);

  return <ChatScreen embedded screen={screen} onCollapse={onCollapse} />;
}
