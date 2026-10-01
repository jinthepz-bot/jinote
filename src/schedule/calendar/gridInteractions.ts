import { createContext, useContext, useSyncExternalStore } from 'react';

import { DEFAULT_DURATION_MIN, type CalendarItem } from './items';

// Pointer interactions on the week/day grid: drag a block to move it, drag its bottom
// edge to resize it, hover it for a details card.
//
// Smoothness is the point of the design. React renders only when a drag starts (the
// original block fades, a preview appears) and when it ends. In between, the preview's
// position and its time label are written straight to the DOM once per animation
// frame, and nothing touches storage until the pointer is released. Web only: these
// are DOM pointer events, and the desktop layout is where they matter.

export const SNAP_MINUTES = 15;
const DRAG_THRESHOLD_PX = 4; // below this a press is a click, not a drag
const HOVER_DELAY_MS = 300;
const CARD_GRACE_MS = 150;
const AUTOSCROLL_EDGE_PX = 40;
const AUTOSCROLL_MAX_SPEED = 14; // px per frame, reached right at the edge
const DAY_END = 24 * 60 - 1; // 23:59 — the model has no 24:00
export const PREVIEW_MIN_HEIGHT = 14;

export type DragMode = 'move' | 'resize';
// What the block menu can do. The first three turn an event into a repeating one.
// 'deleteOccurrence' is "Delete → Only this event" on a repeating one.
export type BlockAction = 'weekdays' | 'daily' | 'weeklyThisMonth' | 'duplicate' | 'delete' | 'deleteOccurrence';
export type RetimeScope = 'single' | 'one' | 'all';

export interface DropResult {
  item: CalendarItem;
  date: string; // the day it was dropped on
  start: number; // minutes from midnight
  end: number | null; // null: it had no end time and still doesn't (moved, not resized)
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Geometry {
  dayIndex: number;
  start: number;
  end: number; // what's drawn: the real end, or the default length
}

interface Snapshot {
  draggingId: string | null; // its original block is drawn faint
  preview: { item: CalendarItem; label: string } | null;
  // An occurrence of a repeating event waiting for "Only this event" or "All events
  // in the series": dropped after a move or resize (its preview stays where it was
  // dropped meanwhile), or picked for deletion from its menu.
  pending:
    | { kind: 'drop'; result: DropResult; anchor: Rect }
    | { kind: 'delete'; item: CalendarItem; anchor: Rect }
    | null;
  tooltip: { item: CalendarItem; anchor: Rect } | null;
  // The block menu (right-click, or "…" on the hover card), at a point in the
  // grid's own coordinates. `picking` = showing the date picker for "Duplicate to…".
  menu: { item: CalendarItem; x: number; y: number; picking: boolean } | null;
}

interface Session {
  item: CalendarItem;
  mode: DragMode;
  downX: number;
  downY: number;
  lastX: number;
  lastY: number;
  grab: number; // minutes between the pointer and the block's start when grabbed
  origin: Geometry;
  hasEnd: boolean;
  current: Geometry;
  started: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
const rectOf = (node: HTMLElement): Rect => {
  const r = node.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

export function dropLabel(start: number, end: number, hasEnd: boolean): string {
  return hasEnd ? `${hhmm(start)}–${hhmm(end)}` : hhmm(start);
}

// Anything with a clock time that has somewhere to be saved: events and timed tasks.
// Logged sessions are records of what happened; deadlines are whole days.
export function canDrag(item: CalendarItem): boolean {
  return item.start !== null && (item.source.kind === 'event' || item.source.kind === 'task');
}

// Only events have an end time to change; a task is a moment.
export const canResize = (item: CalendarItem) => item.start !== null && item.source.kind === 'event';

export const isSeries = (item: CalendarItem) => item.source.kind === 'event' && item.source.event.type === 'recurring';

export class GridInteractions {
  // Set by TimeGrid on every render, read lazily when a pointer event arrives.
  days: string[] = [];
  hourHeight = 52;
  onDrop: (result: DropResult, scope: RetimeScope) => void = () => {};
  onToggleTask: (item: CalendarItem) => void = () => {};
  onAction: (item: CalendarItem, action: BlockAction, date?: string) => void = () => {};
  root: HTMLElement | null = null;
  grid: HTMLElement | null = null;
  scroller: HTMLElement | null = null;
  columns: (HTMLElement | null)[] = [];

  private snapshot: Snapshot = { draggingId: null, preview: null, pending: null, tooltip: null, menu: null };
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private session: Session | null = null;
  private frame: number | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressClickUntil = 0;
  private previewNode: HTMLElement | null = null;
  private previewLabel: HTMLElement | null = null;
  private shield: HTMLDivElement | null = null;

  // --- store plumbing (useSyncExternalStore)

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private set(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  // A drag ends with a pointerup that the block's Pressable also sees as a press;
  // this is how that press knows to do nothing.
  shouldSuppressClick() {
    return Date.now() < this.suppressClickUntil;
  }

  // --- hover card

  hoverIn(item: CalendarItem, node: HTMLElement | null) {
    this.clearHoverTimer();
    if (!node || this.session?.started || this.snapshot.pending || this.snapshot.menu) return;
    // Already showing this block's card (the pointer came back from the card): keep it.
    if (this.snapshot.tooltip?.item.id === item.id) return;
    this.hoverTimer = setTimeout(() => {
      this.hoverTimer = null;
      if (this.session?.started || this.snapshot.pending || this.snapshot.menu) return;
      this.set({ tooltip: { item, anchor: rectOf(node) } });
    }, HOVER_DELAY_MS);
  }

  // Leaving the block hides the card after a short grace, long enough to cross the
  // gap onto the card and use its "…" button; entering the card cancels the hide.
  hoverOut() {
    this.clearHoverTimer();
    if (!this.snapshot.tooltip) return;
    this.hideTimer = setTimeout(() => this.hideTooltip(), CARD_GRACE_MS);
  }

  cardHoverIn() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  // Also a grace rather than instant: moving onto the card's own "…" button reports a
  // hover-out on the card first (react-native-web treats the nested button as its own
  // hover target), and that button's hover-in then cancels the hide.
  cardHoverOut() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hideTooltip(), CARD_GRACE_MS);
  }

  hideTooltip() {
    this.clearHoverTimer();
    if (this.snapshot.tooltip) this.set({ tooltip: null });
  }

  private clearHoverTimer() {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  // --- block menu

  openMenu(item: CalendarItem, clientX: number, clientY: number) {
    if (this.session?.started || this.snapshot.pending || !this.root) return;
    this.clearHoverTimer();
    const box = this.root.getBoundingClientRect();
    this.set({ tooltip: null, menu: { item, x: clientX - box.left, y: clientY - box.top, picking: false } });
    document.addEventListener('keydown', this.onMenuKey, true);
  }

  pickDateInMenu() {
    if (this.snapshot.menu) this.set({ menu: { ...this.snapshot.menu, picking: true } });
  }

  closeMenu = () => {
    document.removeEventListener('keydown', this.onMenuKey, true);
    if (this.snapshot.menu) this.set({ menu: null });
  };

  private onMenuKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();
  };

  // --- drag

  // The preview registers its DOM nodes as it mounts; it takes the drag's current
  // position straight away, since the pointer has already moved by then.
  registerPreview = (node: HTMLElement | null, label: HTMLElement | null) => {
    this.previewNode = node;
    this.previewLabel = label;
    if (node && this.session?.started) this.paint(this.session.current, this.session.hasEnd || this.session.mode === 'resize');
  };

  pointerDown(item: CalendarItem, mode: DragMode, event: PointerEvent) {
    if (event.button !== 0 || this.session || this.snapshot.pending || this.snapshot.menu || !canDrag(item)) return;
    const dayIndex = this.days.indexOf(item.date);
    const column = this.columns[dayIndex];
    if (dayIndex < 0 || !column) return;

    const start = item.start!;
    const end = item.end ?? start + DEFAULT_DURATION_MIN;
    const pointer = this.minutesAt(event.clientY, column);
    this.session = {
      item,
      mode,
      downX: event.clientX,
      downY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      grab: pointer - start,
      origin: { dayIndex, start, end },
      hasEnd: item.end !== null,
      current: { dayIndex, start, end },
      started: false,
    };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.cancel);
    window.addEventListener('blur', this.cancel);
    // Capture phase: react-native-web's TextInput stops keydowns from bubbling.
    document.addEventListener('keydown', this.onKey, true);
  }

  private onMove = (event: PointerEvent) => {
    const s = this.session;
    if (!s) return;
    s.lastX = event.clientX;
    s.lastY = event.clientY;
    if (!s.started) {
      if (Math.hypot(event.clientX - s.downX, event.clientY - s.downY) < DRAG_THRESHOLD_PX) return;
      s.started = true;
      this.clearHoverTimer();
      // Nothing under the dragged block should react (slot highlights, other blocks'
      // hover lift) — that's both flicker and needless re-rendering. A transparent
      // shield over the whole window takes the pointer instead; the drag itself
      // listens on the window, which still gets every move and the release.
      document.body.style.userSelect = 'none';
      this.shield = document.createElement('div');
      Object.assign(this.shield.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        cursor: s.mode === 'resize' ? 'ns-resize' : 'grabbing',
      });
      document.body.appendChild(this.shield);
      this.set({
        draggingId: s.item.id,
        tooltip: null,
        preview: { item: s.item, label: dropLabel(s.origin.start, s.origin.end, s.hasEnd || s.mode === 'resize') },
      });
    }
    this.schedule();
  };

  private schedule() {
    if (this.frame === null) this.frame = requestAnimationFrame(this.tick);
  }

  // One frame: scroll if the pointer is at the grid's top or bottom edge, work out
  // where the block would land, and draw the preview there.
  private tick = () => {
    this.frame = null;
    const s = this.session;
    if (!s?.started) return;

    let scrolled = false;
    if (this.scroller) {
      const box = this.scroller.getBoundingClientRect();
      const fromTop = s.lastY - box.top;
      const fromBottom = box.bottom - s.lastY;
      const speed = (distance: number) => Math.ceil(AUTOSCROLL_MAX_SPEED * (1 - Math.max(0, distance) / AUTOSCROLL_EDGE_PX));
      if (fromTop < AUTOSCROLL_EDGE_PX && this.scroller.scrollTop > 0) {
        this.scroller.scrollTop -= speed(fromTop);
        scrolled = true;
      } else if (fromBottom < AUTOSCROLL_EDGE_PX && this.scroller.scrollTop + box.height < this.scroller.scrollHeight) {
        this.scroller.scrollTop += speed(fromBottom);
        scrolled = true;
      }
    }

    s.current = this.geometryAt(s);
    this.paint(s.current, s.hasEnd || s.mode === 'resize');
    if (scrolled) this.schedule(); // keep scrolling while the pointer rests at the edge
  };

  private geometryAt(s: Session): Geometry {
    const rects = this.columns.map((c) => (c ? c.getBoundingClientRect() : null));
    if (s.mode === 'resize') {
      const column = rects[s.origin.dayIndex];
      if (!column) return s.current;
      const pointer = ((s.lastY - column.top) / this.hourHeight) * 60;
      const end = Math.min(DAY_END, Math.max(s.origin.start + SNAP_MINUTES, snap(pointer)));
      return { dayIndex: s.origin.dayIndex, start: s.origin.start, end };
    }

    // The column under the pointer; beyond the first or last column, the nearest.
    let dayIndex = s.current.dayIndex;
    rects.forEach((r, i) => {
      if (r && s.lastX >= r.left && s.lastX < r.right) dayIndex = i;
    });
    const first = rects[0];
    const last = rects[rects.length - 1];
    if (first && s.lastX < first.left) dayIndex = 0;
    if (last && s.lastX >= last.right) dayIndex = rects.length - 1;

    const column = rects[dayIndex];
    if (!column) return s.current;
    const length = s.origin.end - s.origin.start;
    const pointer = ((s.lastY - column.top) / this.hourHeight) * 60;
    const latestStart = Math.floor((DAY_END - (s.hasEnd ? length : 0)) / SNAP_MINUTES) * SNAP_MINUTES;
    const start = Math.min(latestStart, Math.max(0, snap(pointer - s.grab)));
    return { dayIndex, start, end: start + length };
  }

  private paint(g: Geometry, showEnd: boolean) {
    const node = this.previewNode;
    const column = this.columns[g.dayIndex];
    if (!node || !column || !this.grid) return;
    const grid = this.grid.getBoundingClientRect();
    const col = column.getBoundingClientRect();
    node.style.left = `${col.left - grid.left + 2}px`;
    node.style.width = `${col.width - 4}px`;
    node.style.top = `${(g.start / 60) * this.hourHeight}px`;
    node.style.height = `${Math.max(PREVIEW_MIN_HEIGHT, ((g.end - g.start) / 60) * this.hourHeight)}px`;
    if (this.previewLabel) this.previewLabel.textContent = dropLabel(g.start, g.end, showEnd);
  }

  private onUp = () => {
    const s = this.session;
    if (!s) return;
    this.detach();
    if (!s.started) {
      this.session = null; // a click: the block's own onPress handles it
      return;
    }
    s.current = this.geometryAt(s);
    this.suppressClickUntil = Date.now() + 400;
    this.restoreBody();

    const g = s.current;
    const moved = g.dayIndex !== s.origin.dayIndex || g.start !== s.origin.start || g.end !== s.origin.end;
    if (!moved) {
      this.finish();
      return;
    }
    const result: DropResult = {
      item: s.item,
      date: this.days[g.dayIndex],
      start: g.start,
      end: s.hasEnd || s.mode === 'resize' ? g.end : null,
    };

    if (isSeries(s.item)) {
      const anchor = this.previewNode ? rectOf(this.previewNode) : { left: 0, top: 0, right: 0, bottom: 0 };
      this.session = null;
      this.set({
        pending: { kind: 'drop', result, anchor },
        preview: { item: s.item, label: dropLabel(g.start, g.end, result.end !== null) },
      });
      document.addEventListener('keydown', this.onKey, true);
      return;
    }
    this.onDrop(result, 'single');
    this.finish();
  };

  // The answer to "Only this event / All events in the series", or null for Cancel.
  resolvePending = (scope: 'one' | 'all' | null) => {
    const pending = this.snapshot.pending;
    if (!pending) return;
    this.finish();
    if (!scope) return;
    if (pending.kind === 'drop') this.onDrop(pending.result, scope);
    else this.onAction(pending.item, scope === 'one' ? 'deleteOccurrence' : 'delete');
  };

  // "Delete" on a repeating event's menu: ask first, next to where the menu was.
  askDelete(item: CalendarItem, clientX: number, clientY: number) {
    this.closeMenu();
    const anchor = { left: clientX, top: clientY, right: clientX, bottom: clientY };
    this.set({ pending: { kind: 'delete', item, anchor } });
    document.addEventListener('keydown', this.onKey, true);
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (this.session?.started) {
      event.preventDefault();
      event.stopPropagation();
      this.suppressClickUntil = Date.now() + 400;
      this.cancel();
    } else if (this.snapshot.pending) {
      event.preventDefault();
      event.stopPropagation();
      this.resolvePending(null);
    }
  };

  cancel = () => {
    this.detach();
    this.restoreBody();
    this.finish();
  };

  private finish() {
    this.session = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    document.removeEventListener('keydown', this.onKey, true);
    this.set({ draggingId: null, preview: null, pending: null });
  }

  private detach() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.cancel);
    window.removeEventListener('blur', this.cancel);
  }

  private restoreBody() {
    document.body.style.userSelect = '';
    this.shield?.remove();
    this.shield = null;
  }

  private minutesAt(clientY: number, column: HTMLElement) {
    return ((clientY - column.getBoundingClientRect().top) / this.hourHeight) * 60;
  }

  dispose() {
    this.clearHoverTimer();
    this.closeMenu();
    if (this.session || this.snapshot.pending) this.cancel();
  }
}

export const InteractionsContext = createContext<GridInteractions | null>(null);

export function useInteractions(): GridInteractions | null {
  return useContext(InteractionsContext);
}

// Subscribes to one slice of the controller's state, so only what changed re-renders:
// a block to its own "being dragged" flag, the preview to the preview, and so on.
export function useInteractionState<T>(controller: GridInteractions | null, select: (s: Snapshot) => T): T | null {
  return useSyncExternalStore(
    controller ? controller.subscribe : noopSubscribe,
    () => (controller ? select(controller.getSnapshot()) : null),
  );
}
const noopSubscribe = () => () => {};

export const rectRelativeTo = (rect: Rect, root: HTMLElement): Rect => {
  const r = root.getBoundingClientRect();
  return { left: rect.left - r.left, top: rect.top - r.top, right: rect.right - r.left, bottom: rect.bottom - r.top };
};
