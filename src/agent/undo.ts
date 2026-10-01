import { deleteBuyItem, deleteGoal, deleteTask, getCoachState, setGoalDeadline, toggleBought, toggleTask, undoLog } from '../coach/store';
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
    case 'deleteGoal':
      deleteGoal(undo.id);
      return true;
    case 'setDeadline':
      setGoalDeadline(undo.goalId, undo.deadline);
      return true;
  }
}
