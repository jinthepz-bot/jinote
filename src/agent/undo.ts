import {
  deleteBuyItem,
  deleteGoal,
  deleteTask,
  getCoachState,
  removeEntries,
  restoreEntry,
  restoreGoal,
  restoreGoalDetails,
  setFeaturedGoal,
  setGoalDeadline,
  toggleBought,
  toggleTask,
  undoLog,
} from '../coach/store';
import { deleteNote } from '../notes/store';
import { deleteEvent, restoreEvent } from '../schedule/store';
import type { UndoRecord } from '../types';

// Takes back one change the coach made, using the same store functions the rest of
// the app does (the calendar's restoreEvent among them). Returns false when there's
// nothing left to undo — e.g. the task was already reopened by hand.
export function runUndo(undo: UndoRecord): boolean {
  switch (undo.kind) {
    case 'deleteTask':
      deleteTask(undo.id);
      return true;
    case 'reopenTask': {
      const task = getCoachState().tasks.find((t) => t.id === undo.id);
      if (!task?.done) return false;
      toggleTask(task.id); // clears completedAt too, so "Done today" stays right
      return true;
    }
    case 'deleteEvent':
      deleteEvent(undo.id);
      return true;
    case 'restoreEvent':
      restoreEvent(undo.event);
      return true;
    case 'deleteBuyItem':
      deleteBuyItem(undo.id);
      return true;
    case 'unbuy': {
      const item = getCoachState().toBuy.find((b) => b.id === undo.id);
      if (!item?.bought) return false;
      toggleBought(item.id);
      return true;
    }
    case 'deleteNote':
      return deleteNote(undo.id) !== null;
    case 'removeLog':
      undoLog(undo.entryId, undo.previousCurrent);
      return true;
    case 'removeLogs':
      removeEntries(undo.entryIds, undo.previousCurrent);
      return true;
    case 'restoreSet':
      restoreEntry(undo.entry, undo.previousCurrent);
      return true;
    case 'deleteGoal':
      return deleteGoal(undo.id) !== null;
    case 'restoreGoal':
      restoreGoal(undo.goal, undo.entries, undo.index);
      return true;
    case 'restoreGoalDetails':
      restoreGoalDetails(undo.goal);
      return true;
    case 'setFeatured':
      if (!getCoachState().goals.some((g) => g.id === undo.goalId)) return false;
      setFeaturedGoal(undo.goalId);
      return true;
    case 'setDeadline':
      setGoalDeadline(undo.goalId, undo.deadline);
      return true;
  }
}
