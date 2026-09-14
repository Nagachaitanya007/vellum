import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { emptyDrawing, normalizeDrawing } from "./drawing";
import {
  dailyTitle,
  displayTitle,
  findNoteByTitle,
  closeTab,
  openTab,
  pruneTabs,
  sortNotes,
} from "./helpers";
import { DEFAULT_GRAPH_STYLE, normalizeGraphStyle } from "./graph-style";
import { DEFAULT_FOLDERS, seedNotes } from "./seed";
import { nextAdoptVaultUser, reconcileMerge } from "./sync-engine";
import { mergeVault } from "./merge";
import { nextRevision, observeRevision, revisionAfter } from "./revision";
import type {
  CreateNoteInput,
  Drawing,
  Folder,
  GraphStyle,
  LibraryFilter,
  ListMode,
  Note,
  PreviewMode,
  SyncStatus,
  ThemeMode,
  VaultKind,
  VaultPayload,
  VaultRecord,
  WorkspaceView,
} from "./types";
import { PRIMARY_VAULT_ID } from "./types";

const STORAGE_KEY = "vellum-notes-v3";
const LEGACY_KEYS = ["vellum-notes-v2", "vellum-notes-v1"];

function debouncedLocalStorage(ms = 220): StateStorage {
  let timer = 0;
  let pendingKey: string | null = null;
  let pendingValue: string | null = null;

  const flush = () => {
    if (pendingKey === null || pendingValue === null) return;
    localStorage.setItem(pendingKey, pendingValue);
    pendingKey = null;
    pendingValue = null;
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      pendingKey = name;
      pendingValue = value;
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, ms);
    },
    removeItem: (name) => {
      window.clearTimeout(timer);
      pendingKey = null;
      pendingValue = null;
      localStorage.removeItem(name);
    },
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeNote(raw: Partial<Note> & { id: string; title?: string; content?: string }): Note {
  const note: Note = {
    id: raw.id,
    title: raw.title ?? "",
    content: raw.content ?? "",
    folderId: raw.folderId ?? null,
    pinned: Boolean(raw.pinned),
    drawing: normalizeDrawing(raw.drawing),
    kind: raw.kind === "canvas" ? "canvas" : "markdown",
    createdAt: raw.createdAt ?? Date.now(),
    updatedAt: raw.updatedAt ?? Date.now(),
  };
  observeRevision(note.createdAt);
  observeRevision(note.updatedAt);
  return note;
}

type NotesState = {
  notes: Note[];
  folders: Folder[];
  activeId: string | null;
  openTabIds: string[];
  filter: LibraryFilter;
  previewMode: PreviewMode;
  graphOpen: boolean;
  workspace: WorkspaceView;
  theme: ThemeMode;
  listMode: ListMode;
  graphStyle: GraphStyle;
  initialized: boolean;
  hasHydrated: boolean;
  dirtyNoteIds: string[];
  pendingDeletes: string[];
  pendingDeleteAt: Record<string, number>;
  dirtyFolders: boolean;
  foldersUpdatedAt: number;
  syncStatus: SyncStatus;
  lastSyncedAt: number | null;
  vaultOwnerId: string | null;
  lastVaultOwnerId: string | null;
  vaults: VaultRecord[];
  activeVaultId: string;
  vaultPayloads: Record<string, VaultPayload>;
  adoptVaultUser: (userId: string | null) => void;
  createNote: (input?: CreateNoteInput) => string;
  deleteNote: (id: string) => void;
  updateNote: (
    id: string,
    patch: Partial<Pick<Note, "title" | "content" | "folderId" | "drawing">>,
  ) => void;
  togglePin: (id: string) => void;
  selectNote: (id: string) => void;
  closeNoteTab: (id: string) => void;
  setFilter: (filter: LibraryFilter) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  cyclePreviewMode: (allowSplit: boolean) => void;
  selectAdjacent: (direction: -1 | 1, ids?: string[]) => void;
  createFolder: (name: string) => string;
  deleteFolder: (id: string) => void;
  openDailyNote: () => string;
  openWiki: (title: string) => string;
  toggleGraph: () => void;
  setGraphOpen: (open: boolean) => void;
  setWorkspace: (view: WorkspaceView) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setListMode: (mode: ListMode) => void;
  setGraphStyle: (patch: Partial<GraphStyle>) => void;
  updateDrawing: (id: string, drawing: Drawing) => void;
  setHasHydrated: (value: boolean) => void;
  createVault: (name: string) => string;
  switchVault: (id: string) => void;
  renameVault: (id: string, name: string) => void;
};

type PersistedSlice = {
  notes?: Array<Partial<Note> & { id: string }>;
  folders?: Folder[];
  activeId?: string | null;
  openTabIds?: string[];
  filter?: LibraryFilter;
  previewMode?: PreviewMode;
  theme?: ThemeMode;
  listMode?: ListMode;
  graphStyle?: Partial<GraphStyle>;
  graphOpen?: boolean;
  initialized?: boolean;
  dirtyNoteIds?: string[];
  pendingDeletes?: string[];
  pendingDeleteAt?: Record<string, number>;
  dirtyFolders?: boolean;
  foldersUpdatedAt?: number;
  vaultOwnerId?: string | null;
  lastVaultOwnerId?: string | null;
  vaults?: VaultRecord[];
  activeVaultId?: string;
  vaultPayloads?: Record<string, VaultPayload>;
};

function withDirty(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function withoutId(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

function omitKey(map: Record<string, number>, id: string): Record<string, number> {
  if (!(id in map)) return map;
  const { [id]: _dropped, ...rest } = map;
  return rest;
}

function normalizePendingDeleteAt(
  ids: unknown,
  raw: unknown,
): Record<string, number> {
  const list = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  const source =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const out: Record<string, number> = {};
  for (const id of list) {
    const value = source[id];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      out[id] = value;
      observeRevision(value);
    } else {
      out[id] = nextRevision();
    }
  }
  return out;
}

function folderIdForNew(filter: LibraryFilter): string | null {
  return filter.type === "folder" ? filter.id : null;
}

function emptyPayload(): VaultPayload {
  return {
    notes: [],
    folders: DEFAULT_FOLDERS,
    activeId: null,
    openTabIds: [],
    filter: { type: "all" },
    dirtyNoteIds: [],
    pendingDeletes: [],
    pendingDeleteAt: {},
    dirtyFolders: true,
    foldersUpdatedAt: Date.now(),
  };
}

function capturePayload(state: {
  notes: Note[];
  folders: Folder[];
  activeId: string | null;
  openTabIds: string[];
  filter: LibraryFilter;
  dirtyNoteIds: string[];
  pendingDeletes: string[];
  pendingDeleteAt: Record<string, number>;
  dirtyFolders: boolean;
  foldersUpdatedAt: number;
}): VaultPayload {
  return {
    notes: state.notes,
    folders: state.folders,
    activeId: state.activeId,
    openTabIds: state.openTabIds,
    filter: state.filter,
    dirtyNoteIds: state.dirtyNoteIds,
    pendingDeletes: state.pendingDeletes,
    pendingDeleteAt: state.pendingDeleteAt,
    dirtyFolders: state.dirtyFolders,
    foldersUpdatedAt: state.foldersUpdatedAt,
  };
}

function defaultVaults(): VaultRecord[] {
  return [
    {
      id: PRIMARY_VAULT_ID,
      name: "My vault",
      createdAt: Date.now(),
      kind: "synced",
    },
  ];
}

function normalizeVaults(raw: unknown): VaultRecord[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaultVaults();
  const out: VaultRecord[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Partial<VaultRecord>;
    if (typeof rec.id !== "string" || typeof rec.name !== "string") continue;
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);
    const kind: VaultKind = rec.kind === "local" ? "local" : rec.id === PRIMARY_VAULT_ID ? "synced" : "local";
    out.push({
      id: rec.id,
      name: rec.name.trim() || "Untitled vault",
      createdAt: typeof rec.createdAt === "number" ? rec.createdAt : Date.now(),
      kind: rec.id === PRIMARY_VAULT_ID ? "synced" : kind,
    });
  }
  if (!out.some((vault) => vault.id === PRIMARY_VAULT_ID)) {
    out.unshift(defaultVaults()[0]!);
  }
  return out.length > 0 ? out : defaultVaults();
}

function applyPersisted(data: PersistedSlice) {
  const incoming = Array.isArray(data.notes) ? data.notes.map(normalizeNote) : [];
  const folders =
    Array.isArray(data.folders) && data.folders.length > 0 ? data.folders : DEFAULT_FOLDERS;
  const theme: ThemeMode = data.theme === "light" ? "light" : "dark";
  const listMode: ListMode = data.listMode === "table" ? "table" : "list";
  const graphStyle = normalizeGraphStyle(data.graphStyle);
  const previewMode: PreviewMode =
    data.previewMode === "preview" || data.previewMode === "split" ? data.previewMode : "edit";

  if (!data.initialized) {
    const seeded = seedNotes();
    const firstId = seeded.find((note) => note.pinned)?.id ?? seeded[0]?.id ?? null;
    useNotesStore.setState({
      notes: sortNotes(seeded),
      folders: DEFAULT_FOLDERS,
      activeId: firstId,
      openTabIds: firstId ? [firstId] : [],
      filter: { type: "all" },
      previewMode,
      theme,
      listMode,
      graphStyle,
      graphOpen: false,
      initialized: true,
      hasHydrated: true,
      dirtyNoteIds: [],
      pendingDeletes: [],
      pendingDeleteAt: {},
      dirtyFolders: true,
      foldersUpdatedAt: Date.now(),
      vaultOwnerId: null,
      lastVaultOwnerId: null,
      vaults: defaultVaults(),
      activeVaultId: PRIMARY_VAULT_ID,
      vaultPayloads: {},
    });
    return;
  }

  const notes = sortNotes(incoming);
  const noteIds = new Set(notes.map((note) => note.id));
  const activeId =
    data.activeId && notes.some((note) => note.id === data.activeId)
      ? data.activeId
      : (notes[0]?.id ?? null);
  const openTabIds = pruneTabs(
    Array.isArray(data.openTabIds) ? data.openTabIds.filter((id) => typeof id === "string") : [],
    noteIds,
    activeId,
  );
  const foldersUpdatedAt = typeof data.foldersUpdatedAt === "number" ? data.foldersUpdatedAt : 0;
  observeRevision(foldersUpdatedAt);
  const vaults = normalizeVaults(data.vaults);
  const activeVaultId =
    typeof data.activeVaultId === "string" && vaults.some((vault) => vault.id === data.activeVaultId)
      ? data.activeVaultId
      : PRIMARY_VAULT_ID;
  useNotesStore.setState({
    notes,
    folders,
    activeId,
    openTabIds,
    filter: data.filter ?? { type: "all" },
    previewMode,
    theme,
    listMode,
    graphStyle,
    graphOpen: Boolean(data.graphOpen),
    initialized: true,
    hasHydrated: true,
    dirtyNoteIds: Array.isArray(data.dirtyNoteIds) ? data.dirtyNoteIds : [],
    pendingDeletes: Array.isArray(data.pendingDeletes) ? data.pendingDeletes : [],
    pendingDeleteAt: normalizePendingDeleteAt(data.pendingDeletes, data.pendingDeleteAt),
    dirtyFolders: Boolean(data.dirtyFolders),
    foldersUpdatedAt,
    vaultOwnerId: typeof data.vaultOwnerId === "string" ? data.vaultOwnerId : null,
    lastVaultOwnerId:
      typeof data.lastVaultOwnerId === "string"
        ? data.lastVaultOwnerId
        : typeof data.vaultOwnerId === "string"
          ? data.vaultOwnerId
          : null,
    vaults,
    activeVaultId,
    vaultPayloads:
      data.vaultPayloads && typeof data.vaultPayloads === "object" ? data.vaultPayloads : {},
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
      openTabIds: [],
      filter: { type: "all" },
      previewMode: "edit",
      graphOpen: false,
      workspace: "notes",
      theme: "dark",
      listMode: "list",
      graphStyle: { ...DEFAULT_GRAPH_STYLE },
      initialized: false,
      hasHydrated: false,
      dirtyNoteIds: [],
      pendingDeletes: [],
      pendingDeleteAt: {},
      dirtyFolders: false,
      foldersUpdatedAt: 0,
      syncStatus: "local",
      lastSyncedAt: null,
      vaultOwnerId: null,
      lastVaultOwnerId: null,
      vaults: defaultVaults(),
      activeVaultId: PRIMARY_VAULT_ID,
      vaultPayloads: {},

      setHasHydrated: (value) => set({ hasHydrated: value }),

      adoptVaultUser: (userId) => {
        const adopted = nextAdoptVaultUser(
          {
            vaultOwnerId: get().vaultOwnerId,
            lastVaultOwnerId: get().lastVaultOwnerId,
          },
          userId,
        );
        if (!adopted.wipe) {
          set({
            vaultOwnerId: adopted.vaultOwnerId,
            lastVaultOwnerId: adopted.lastVaultOwnerId,
            syncStatus: adopted.vaultOwnerId ? "syncing" : "local",
          });
          return;
        }
        const state = get();
        const onSynced = state.activeVaultId === PRIMARY_VAULT_ID;
        if (onSynced) {
          set({
            notes: [],
            folders: [],
            activeId: null,
            openTabIds: [],
            dirtyNoteIds: [],
            pendingDeletes: [],
            pendingDeleteAt: {},
            dirtyFolders: false,
            foldersUpdatedAt: 0,
            vaultOwnerId: adopted.vaultOwnerId,
            lastVaultOwnerId: adopted.lastVaultOwnerId,
            initialized: true,
            syncStatus: "syncing",
          });
          return;
        }
        set({
          vaultPayloads: {
            ...state.vaultPayloads,
            [PRIMARY_VAULT_ID]: emptyPayload(),
          },
          vaultOwnerId: adopted.vaultOwnerId,
          lastVaultOwnerId: adopted.lastVaultOwnerId,
          initialized: true,
        });
      },

      createNote: (input = {}) => {
        const now = nextRevision();
        const filter = get().filter;
        const note: Note = {
          id: newId(),
          title: input.title ?? "",
          content: input.content ?? "",
          folderId: input.folderId !== undefined ? input.folderId : folderIdForNew(filter),
          pinned: Boolean(input.pinned),
          drawing: input.drawing ?? emptyDrawing(),
          kind: input.kind === "canvas" ? "canvas" : "markdown",
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          notes: sortNotes([note, ...state.notes]),
          activeId: note.id,
          openTabIds: openTab(state.openTabIds, note.id),
          previewMode: "edit",
          workspace: "notes",
          dirtyNoteIds: withDirty(state.dirtyNoteIds, note.id),
          pendingDeletes: withoutId(state.pendingDeletes, note.id),
          pendingDeleteAt: omitKey(state.pendingDeleteAt, note.id),
        }));
        return note.id;
      },

      deleteNote: (id) => {
        set((state) => {
          const existing = state.notes.find((note) => note.id === id);
          const deletedAt = revisionAfter(existing?.updatedAt ?? 0);
          const remaining = state.notes.filter((note) => note.id !== id);
          const tabs = closeTab(state.openTabIds, id, state.activeId);
          const nextActive =
            tabs.activeId && remaining.some((note) => note.id === tabs.activeId)
              ? tabs.activeId
              : (remaining[0]?.id ?? null);
          return {
            notes: sortNotes(remaining),
            activeId: nextActive,
            openTabIds: nextActive ? openTab(tabs.ids, nextActive) : tabs.ids,
            dirtyNoteIds: withoutId(state.dirtyNoteIds, id),
            pendingDeletes: withDirty(state.pendingDeletes, id),
            pendingDeleteAt: { ...state.pendingDeleteAt, [id]: deletedAt },
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
                    updatedAt: revisionAfter(note.updatedAt),
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
            note.id === id ? { ...note, drawing, updatedAt: revisionAfter(note.updatedAt) } : note,
          ),
          dirtyNoteIds: withDirty(state.dirtyNoteIds, id),
        }));
      },

      togglePin: (id) => {
        set((state) => ({
          notes: sortNotes(
            state.notes.map((note) =>
              note.id === id
                ? { ...note, pinned: !note.pinned, updatedAt: revisionAfter(note.updatedAt) }
                : note,
            ),
          ),
          dirtyNoteIds: withDirty(state.dirtyNoteIds, id),
        }));
      },

      selectNote: (id) =>
        set((state) => ({
          activeId: id,
          workspace: "notes",
          openTabIds: openTab(state.openTabIds, id),
        })),

      closeNoteTab: (id) =>
        set((state) => {
          const next = closeTab(state.openTabIds, id, state.activeId);
          return {
            openTabIds: next.ids,
            activeId: next.activeId,
            workspace: "notes",
          };
        }),

      setFilter: (filter) => set({ filter, workspace: "notes" }),

      setPreviewMode: (mode) => set({ previewMode: mode }),

      cyclePreviewMode: (allowSplit) => {
        const order: PreviewMode[] = allowSplit
          ? ["edit", "preview", "split"]
          : ["edit", "preview"];
        const current = get().previewMode;
        const usable = order.includes(current) ? current : "edit";
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
        if (nextId) set((state) => ({ activeId: nextId, workspace: "notes", openTabIds: openTab(state.openTabIds, nextId) }));
      },

      createFolder: (name) => {
        const trimmed = name.trim() || "Untitled folder";
        const folder: Folder = { id: newId(), name: trimmed };
        set((state) => ({
          folders: [...state.folders, folder],
          filter: { type: "folder", id: folder.id },
          workspace: "notes",
          dirtyFolders: true,
          foldersUpdatedAt: revisionAfter(state.foldersUpdatedAt),
        }));
        return folder.id;
      },

      deleteFolder: (id) => {
        set((state) => {
          const touched: string[] = [];
          const notes = state.notes.map((note) => {
            if (note.folderId !== id) return note;
            touched.push(note.id);
            return { ...note, folderId: null, updatedAt: revisionAfter(note.updatedAt) };
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
            foldersUpdatedAt: revisionAfter(state.foldersUpdatedAt),
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
          set((state) => ({
            activeId: existing.id,
            filter: { type: "daily" },
            previewMode: "edit",
            workspace: "notes",
            openTabIds: openTab(state.openTabIds, existing.id),
          }));
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
          set((state) => ({
            activeId: existing.id,
            workspace: "notes",
            openTabIds: openTab(state.openTabIds, existing.id),
          }));
          return existing.id;
        }
        return get().createNote({
          title: title.trim() || "Untitled",
          folderId: folderIdForNew(get().filter),
        });
      },

      toggleGraph: () => set((state) => ({ graphOpen: !state.graphOpen })),

      setGraphOpen: (open) => set({ graphOpen: open }),

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

      setGraphStyle: (patch) =>
        set((state) => ({
          graphStyle: normalizeGraphStyle({ ...state.graphStyle, ...patch }),
        })),

      createVault: (name) => {
        const trimmed = name.trim() || "Untitled vault";
        const id = newId();
        const state = get();
        const parked = {
          ...state.vaultPayloads,
          [state.activeVaultId]: capturePayload(state),
        };
        const empty = emptyPayload();
        set({
          vaults: [
            ...state.vaults,
            { id, name: trimmed, createdAt: Date.now(), kind: "local" },
          ],
          vaultPayloads: parked,
          activeVaultId: id,
          notes: empty.notes,
          folders: empty.folders,
          activeId: null,
          openTabIds: [],
          filter: empty.filter,
          dirtyNoteIds: [],
          pendingDeletes: [],
          pendingDeleteAt: {},
          dirtyFolders: empty.dirtyFolders,
          foldersUpdatedAt: empty.foldersUpdatedAt,
          syncStatus: "local",
          workspace: "notes",
        });
        return id;
      },

      switchVault: (id) => {
        const state = get();
        if (id === state.activeVaultId) return;
        const target = state.vaults.find((vault) => vault.id === id);
        if (!target) return;
        const incoming = state.vaultPayloads[id] ?? emptyPayload();
        const parked: Record<string, VaultPayload> = {
          ...state.vaultPayloads,
          [state.activeVaultId]: capturePayload(state),
        };
        delete parked[id];
        const notes = sortNotes(incoming.notes.map((note) => normalizeNote(note)));
        const noteIds = new Set(notes.map((note) => note.id));
        const activeId =
          incoming.activeId && noteIds.has(incoming.activeId)
            ? incoming.activeId
            : (notes[0]?.id ?? null);
        set({
          vaults: state.vaults,
          vaultPayloads: parked,
          activeVaultId: id,
          notes,
          folders: incoming.folders.length > 0 ? incoming.folders : DEFAULT_FOLDERS,
          activeId,
          openTabIds: pruneTabs(incoming.openTabIds ?? [], noteIds, activeId),
          filter: incoming.filter ?? { type: "all" },
          dirtyNoteIds: incoming.dirtyNoteIds ?? [],
          pendingDeletes: incoming.pendingDeletes ?? [],
          pendingDeleteAt: incoming.pendingDeleteAt ?? {},
          dirtyFolders: incoming.dirtyFolders,
          foldersUpdatedAt: incoming.foldersUpdatedAt,
          syncStatus: target.kind === "synced" ? (state.vaultOwnerId ? "syncing" : "local") : "local",
          workspace: "notes",
        });
      },

      renameVault: (id, name) => {
        const trimmed = name.trim() || "Untitled vault";
        set((state) => ({
          vaults: state.vaults.map((vault) =>
            vault.id === id ? { ...vault, name: trimmed } : vault,
          ),
        }));
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => debouncedLocalStorage()),
      skipHydration: true,
      partialize: (state) => ({
        notes: state.notes,
        folders: state.folders,
        activeId: state.activeId,
        filter: state.filter,
        previewMode: state.previewMode,
        theme: state.theme,
        listMode: state.listMode,
        graphStyle: state.graphStyle,
        initialized: state.initialized,
        dirtyNoteIds: state.dirtyNoteIds,
        pendingDeletes: state.pendingDeletes,
        pendingDeleteAt: state.pendingDeleteAt,
        dirtyFolders: state.dirtyFolders,
        foldersUpdatedAt: state.foldersUpdatedAt,
        lastVaultOwnerId: state.lastVaultOwnerId,
        vaultOwnerId: state.vaultOwnerId,
        openTabIds: state.openTabIds,
        graphOpen: state.graphOpen,
        vaults: state.vaults,
        activeVaultId: state.activeVaultId,
        vaultPayloads: state.vaultPayloads,
      }),
    },
  ),
);

export function useActiveNote(): Note | undefined {
  return useNotesStore((state) => state.notes.find((note) => note.id === state.activeId));
}

export function useActiveVault(): VaultRecord {
  return useNotesStore((state) => {
    return state.vaults.find((vault) => vault.id === state.activeVaultId) ?? state.vaults[0] ?? defaultVaults()[0]!;
  });
}

export function useFolderName(folderId: string | null): string {
  const folders = useNotesStore((state) => state.folders);
  if (!folderId) return "Unfiled";
  return folders.find((folder) => folder.id === folderId)?.name ?? "Unfiled";
}

export { displayTitle };

const STORAGE_EVENT_KEY = STORAGE_KEY;

function ingestOtherTab(raw: string) {
  try {
    const parsed = JSON.parse(raw) as { state?: PersistedSlice };
    const data = parsed.state;
    if (!data) return;
    const current = useNotesStore.getState();
    const foreignOwner =
      typeof data.vaultOwnerId === "string" ? data.vaultOwnerId : null;
    if (
      foreignOwner &&
      current.vaultOwnerId &&
      foreignOwner !== current.vaultOwnerId
    ) {
      return;
    }
    const incoming = Array.isArray(data.notes) ? data.notes.map(normalizeNote) : [];
    const folders =
      Array.isArray(data.folders) && data.folders.length > 0 ? data.folders : current.folders;
    const merged = mergeVault(
      {
        notes: current.notes,
        folders: current.folders,
        dirtyNoteIds: current.dirtyNoteIds,
        pendingDeletes: current.pendingDeletes,
        pendingDeleteAt: current.pendingDeleteAt,
        dirtyFolders: current.dirtyFolders,
        foldersUpdatedAt: current.foldersUpdatedAt,
      },
      {
        notes: incoming,
        deletedIds: Array.isArray(data.pendingDeletes) ? data.pendingDeletes : [],
        deletedAt:
          data.pendingDeleteAt && typeof data.pendingDeleteAt === "object"
            ? Object.fromEntries(
                Object.entries(data.pendingDeleteAt).filter(
                  (entry): entry is [string, number] => typeof entry[1] === "number",
                ),
              )
            : {},
        folders,
        foldersUpdatedAt:
          typeof data.foldersUpdatedAt === "number" ? data.foldersUpdatedAt : 0,
      },
    );
    const latest = useNotesStore.getState();
    const reconciled = reconcileMerge(merged, {
      notes: latest.notes,
      folders: latest.folders,
      dirtyNoteIds: latest.dirtyNoteIds,
      pendingDeletes: latest.pendingDeletes,
      pendingDeleteAt: latest.pendingDeleteAt,
      dirtyFolders: latest.dirtyFolders,
      foldersUpdatedAt: latest.foldersUpdatedAt,
      activeId: latest.activeId,
    });
    useNotesStore.setState({
      notes: reconciled.notes,
      folders: reconciled.folders,
      dirtyNoteIds: reconciled.dirtyNoteIds,
      pendingDeletes: reconciled.pendingDeletes,
      pendingDeleteAt: reconciled.pendingDeleteAt,
      dirtyFolders: reconciled.dirtyFolders,
      foldersUpdatedAt: reconciled.foldersUpdatedAt,
      activeId: reconciled.activeId,
      openTabIds: pruneTabs(
        current.openTabIds,
        new Set(reconciled.notes.map((note) => note.id)),
        reconciled.activeId,
      ),
    });
  } catch {
    /* ignore malformed persist from another tab */
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) return;
    ingestOtherTab(event.newValue);
  });
}

