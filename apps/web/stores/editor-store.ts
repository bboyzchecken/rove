import { create } from 'zustand';

/**
 * UI state ONLY (DEV_SPEC §2.1). Nothing that came from the API may live here —
 * duplicating server data in two caches is exactly the bug this rule prevents.
 */
interface EditorState {
  /** Item currently being dragged on the timeline. */
  draggingItemId: string | null;
  selectedItemId: string | null;
  /** Which side panel is open, if any. */
  openPanel: 'wishlist' | 'coverage' | 'rationale' | null;
  /** Day index the mobile timeline is scrolled to. */
  activeDayIndex: number;

  setDraggingItem: (id: string | null) => void;
  selectItem: (id: string | null) => void;
  setPanel: (panel: EditorState['openPanel']) => void;
  setActiveDay: (index: number) => void;
  reset: () => void;
}

const initial = {
  draggingItemId: null,
  selectedItemId: null,
  openPanel: null,
  activeDayIndex: 0,
} satisfies Partial<EditorState>;

export const useEditorStore = create<EditorState>((set) => ({
  ...initial,
  setDraggingItem: (id) => set({ draggingItemId: id }),
  selectItem: (id) => set({ selectedItemId: id }),
  setPanel: (panel) => set({ openPanel: panel }),
  setActiveDay: (index) => set({ activeDayIndex: index }),
  reset: () => set(initial),
}));
