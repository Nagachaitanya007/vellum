import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { emptyDrawing, normalizeDrawing } from "./drawing";
import {
  dailyTitle,
  displayTitle,
  findNoteByTitle,
  sortNotes,
} from "./helpers";
import { DEFAULT_FOLDERS, seedNotes } from "./seed";
import type {
  CreateNoteInput,
  Drawing,
  Folder,
  LibraryFilter,
  ListMode,
  Note,
  PreviewMode,
  SyncStatus,
  ThemeMode,
  WorkspaceView,
} from "./types";

export const STORAGE_KEY = "vellum-notes-v3";
const LEGACY_KEYS = ["vellum-notes-v2", "vellum-notes-v1"];

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeNote(raw: Partial<Note> & { id: string; title?: string; content?: string }): Note {
  return {
    id: raw.id,
    title: raw.title ?? "",
    content: raw.content ?? "",
    folderId: raw.folderId ?? null,
    pinned: Boolean(raw.pinned),
    drawing: normalizeDrawing(raw.drawing),
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
  };
}

type NotesState = {
  notes: Note[];
  folders: Folder[];
  activeId: string | null;
  filter: LibraryFilter;
  previewMode: PreviewMode;
  graphOpen: boolean;
  workspace: WorkspaceView;
  theme: ThemeMode;
  listMode: ListMode;
  initialized: boolean;
  hasHydrated: boolean;
  dirtyNoteIds: string[];
  pendingDeletes: string[];
  dirtyFolders: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: number | null;
  createNote: (input?: CreateNoteInput) => string;
  deleteNote: (id: string) => void;
  updateNote: (
    id: string,
    patch: Partial<Pick<Note, "title" | "content" | "folderId" | "drawing">>,
  ) => void;
  togglePin: (id: string) => void;
  selectNote: (id: string) => void;
  setFilter: (filter: LibraryFilter) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  cyclePreviewMode: (allowSplit: boolean) => void;
  selectAdjacent: (direction: -1 | 1, ids?: string[]) => void;
  createFolder: (name: string) => string;
  deleteFolder: (id: string) => void;
  openDailyNote: () => string;
  openWiki: (title: string) => string;
  toggleGraph: () => void;
  setWorkspace: (view: WorkspaceView) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setListMode: (mode: ListMode) => void;
  updateDrawing: (id: string, drawing: Drawing) => void;
  setHasHydrated: (value: boolean) => void;
};

type PersistedSlice = {
  notes?: Array<Partial<Note> & { id: string }>;
  folders?: Folder[];
  activeId?: string | null;
  filter?: LibraryFilter;
  previewMode?: PreviewMode;
  theme?: ThemeMode;
  listMode?: ListMode;
  initialized?: boolean;
  dirtyNoteIds?: string[];
  pendingDeletes?: string[];
  dirtyFolders?: boolean;
};

function withDirty(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function withoutId(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

function folderIdForNew(filter: LibraryFilter): string | null {
  return filter.type === "folder" ? filter.id : null;
}

function applyPersisted(data: PersistedSlice) {
  const incoming = Array.isArray(data.notes) ? data.notes.map(normalizeNote) : [];
  const folders =
    Array.isArray(data.folders) && data.folders.length > 0 ? data.folders : DEFAULT_FOLDERS;
  const theme: ThemeMode = data.theme === "light" ? "light" : "dark";
  const listMode: ListMode = data.listMode === "table" ? "table" : "list";
  const previewMode: PreviewMode =
    data.previewMode === "preview" || data.previewMode === "split" || data.previewMode === "draw"
      ? data.previewMode
      : "edit";

  if (!data.initialized) {
    const seeded = seedNotes();
    useNotesStore.setState({
      notes: sortNotes(seeded),
      folders: DEFAULT_FOLDERS,
      activeId: seeded.find((note) => note.pinned)?.id ?? seeded[0]?.id ?? null,
      filter: { type: "all" },
      previewMode,
      theme,
      listMode,
      initialized: true,
      hasHydrated: true,
      dirtyNoteIds: [],
      pendingDeletes: [],
      dirtyFolders: true,
    });
    return;
  }

  const notes = sortNotes(incoming);
  const activeId =
    data.activeId && notes.some((note) => note.id === data.activeId)
      ? data.activeId
      : (notes[0]?.id ?? null);
  useNotesStore.setState({
    notes,
    folders,
    activeId,
    filter: data.filter ?? { type: "all" },
    previewMode,
    theme,
    listMode,
    initialized: true,
    hasHydrated: true,
    dirtyNoteIds: Array.isArray(data.dirtyNoteIds) ? data.dirtyNoteIds : [],
    pendingDeletes: Array.isArray(data.pendingDeletes) ? data.pendingDeletes : [],
    dirtyFolders: Boolean(data.dirtyFolders),
  });
}

function readJson(key: string): PersistedSlice | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: PersistedSlice; notes?: Note[] };
    if (parsed.state) return parsed.state;
    return parsed as PersistedSlice;
  } catch {
    return null;
  }
}

export function hydrateNotesFromStorage() {
  if (useNotesStore.getState().hasHydrated) return;
  const current = readJson(STORAGE_KEY);
  if (current) {
    applyPersisted(current);
    applyTheme(useNotesStore.getState().theme);
    return;
  }
  for (const key of LEGACY_KEYS) {
    const legacy = readJson(key);
    if (legacy) {
      applyPersisted({
        ...legacy,
        folders: legacy.folders?.length ? legacy.folders : DEFAULT_FOLDERS,
        initialized: true,
      });
      applyTheme(useNotesStore.getState().theme);
      return;
    }
  }
  applyPersisted({});
  applyTheme(useNotesStore.getState().theme);
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      notes: [],
      folders: [],
      activeId: null,
      filter: { type: "all" },
      previewMode: "edit",
      graphOpen: false,
      workspace: "notes",
      theme: "dark",
      listMode: "list",
      initialized: false,
      hasHydrated: false,
      dirtyNoteIds: [],
      pendingDeletes: [],
      dirtyFolders: false,
      syncStatus: "local",
      lastSyncedAt: null,

      setHasHydrated: (value) => set({ hasHydrated: value }),

      createNote: (input = {}) => {
        const now = Date.now();
        const filter = get().filter;
        const note: Note = {
          id: newId(),
          title: input.title ?? "",
          content: input.content ?? "",
          folderId: input.folderId !== undefined ? input.folderId : folderIdForNew(filter),
          pinned: Boolean(input.pinned),
          drawing: input.drawing ?? emptyDrawing(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          notes: sortNotes([note, ...state.notes]),
          activeId: note.id,
          previewMode: "edit",
          workspace: "notes",
          dirtyNoteIds: withDirty(state.dirtyNoteIds, note.id),
          pendingDeletes: withoutId(state.pendingDeletes, note.id),
        }));
        return note.id;
      },

      deleteNote: (id) => {
        set((state) => {
          const remaining = state.notes.filter((note) => note.id !== id);
          const nextActive =
            state.activeId === id ? (remaining[0]?.id ?? null) : state.activeId;
          return {
            notes: sortNotes(remaining),
            activeId: nextActive,
            dirtyNoteIds: withoutId(state.dirtyNoteIds, id),
            pendingDeletes: withDirty(state.pendingDeletes, id),
          };
        });
      },

      updateNote: (id, patch) => {
        set((state) => ({
          notes: sortNotes(
            state.notes.map((note) =>
              note.id === id
                ? {
                    ...note,
                    ...patch,
                    updatedAt: Date.now(),
                  }
                : note,
            ),
          ),
          dirtyNoteIds: withDirty(state.dirtyNoteIds, id),
        }));
      },

      updateDrawing: (id, drawing) => {
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === id ? { ...note, drawing, updatedAt: Date.now() } : note,
          ),
          dirtyNoteIds: withDirty(state.dirtyNoteIds, id),
        }));
      },

      togglePin: (id) => {
        set((state) => ({
          notes: sortNotes(
            state.notes.map((note) =>
              note.id === id
                ? { ...note, pinned: !note.pinned, updatedAt: Date.now() }
                : note,
            ),
          ),
          dirtyNoteIds: withDirty(state.dirtyNoteIds, id),
        }));
      },

      selectNote: (id) => set({ activeId: id, workspace: "notes" }),

      setFilter: (filter) => set({ filter, workspace: "notes" }),

      setPreviewMode: (mode) => set({ previewMode: mode }),

      cyclePreviewMode: (allowSplit) => {
        const order: PreviewMode[] = allowSplit
          ? ["edit", "preview", "split"]
          : ["edit", "preview"];
        const current = get().previewMode;
        const usable =
          current === "draw"
            ? "edit"
            : allowSplit
              ? current
              : current === "split"
                ? "edit"
                : current;
        const index = order.indexOf(usable);
        const next = order[(index + 1) % order.length] ?? "edit";
        set({ previewMode: next });
      },

      selectAdjacent: (direction, ids) => {
        const { notes, activeId } = get();
        const sequence = ids ?? sortNotes(notes).map((note) => note.id);
        if (sequence.length === 0) return;
        const current = activeId ? sequence.indexOf(activeId) : -1;
        const fallback = direction === 1 ? 0 : sequence.length - 1;
        const nextIndex =
          current === -1
            ? fallback
            : (current + direction + sequence.length) % sequence.length;
        const nextId = sequence[nextIndex];
        if (nextId) set({ activeId: nextId, workspace: "notes" });
      },

      createFolder: (name) => {
        const trimmed = name.trim() || "Untitled folder";
        const folder: Folder = { id: newId(), name: trimmed };
        set((state) => ({
          folders: [...state.folders, folder],
          filter: { type: "folder", id: folder.id },
          workspace: "notes",
          dirtyFolders: true,
        }));
        return folder.id;
      },

      deleteFolder: (id) => {
        set((state) => {
          const touched: string[] = [];
          const notes = state.notes.map((note) => {
            if (note.folderId !== id) return note;
            touched.push(note.id);
            return { ...note, folderId: null, updatedAt: Date.now() };
          });
          const filter =
            state.filter.type === "folder" && state.filter.id === id
              ? ({ type: "all" } as const)
              : state.filter;
          return {
            folders: state.folders.filter((folder) => folder.id !== id),
            notes: sortNotes(notes),
            filter,
            dirtyFolders: true,
            dirtyNoteIds: touched.reduce(withDirty, state.dirtyNoteIds),
          };
        });
      },

      openDailyNote: () => {
        const title = dailyTitle();
        const existing = get().notes.find(
          (note) => note.title.trim().toLowerCase() === title.toLowerCase(),
        );
        if (existing) {
          set({
            activeId: existing.id,
            filter: { type: "daily" },
            previewMode: "edit",
            workspace: "notes",
          });
          return existing.id;
        }
        const id = get().createNote({
          title,
          content: `A page for ${title}.\n\n- [ ] \n\n#daily\n`,
        });
        set({ filter: { type: "daily" }, workspace: "notes" });
        return id;
      },

      openWiki: (title) => {
        const existing = findNoteByTitle(get().notes, title);
        if (existing) {
          set({ activeId: existing.id, workspace: "notes" });
          return existing.id;
        }
        return get().createNote({
          title: title.trim() || "Untitled",
          folderId: folderIdForNew(get().filter),
        });
      },

      toggleGraph: () => set((state) => ({ graphOpen: !state.graphOpen })),

      setWorkspace: (view) => set({ workspace: view }),

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },

      toggleTheme: () => {
        const theme = get().theme === "dark" ? "light" : "dark";
        applyTheme(theme);
        set({ theme });
      },

      setListMode: (mode) => set({ listMode: mode }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (state) => ({
        notes: state.notes,
        folders: state.folders,
        activeId: state.activeId,
        filter: state.filter,
        previewMode: state.previewMode === "draw" ? "edit" : state.previewMode,
        theme: state.theme,
        listMode: state.listMode,
        initialized: state.initialized,
        dirtyNoteIds: state.dirtyNoteIds,
        pendingDeletes: state.pendingDeletes,
        dirtyFolders: state.dirtyFolders,
      }),
    },
  ),
);

export function useActiveNote(): Note | undefined {
  return useNotesStore((state) => state.notes.find((note) => note.id === state.activeId));
}

export function useFolderName(folderId: string | null): string {
  const folders = useNotesStore((state) => state.folders);
  if (!folderId) return "Unfiled";
  return folders.find((folder) => folder.id === folderId)?.name ?? "Unfiled";
}

export { displayTitle };
