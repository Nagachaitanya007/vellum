import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { noteMatchesFilter, sortNotes } from "@/lib/notes/helpers";
import { useNotesStore } from "@/lib/notes/store";
import type { Note } from "@/lib/notes/types";

type NotesUiValue = {
  searchRef: RefObject<HTMLInputElement | null>;
  titleRef: RefObject<HTMLInputElement | null>;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  findRef: RefObject<HTMLInputElement | null>;
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  deleteOpen: boolean;
  setDeleteOpen: Dispatch<SetStateAction<boolean>>;
  helpOpen: boolean;
  setHelpOpen: Dispatch<SetStateAction<boolean>>;
  paletteOpen: boolean;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  findOpen: boolean;
  setFindOpen: Dispatch<SetStateAction<boolean>>;
  replaceOpen: boolean;
  setReplaceOpen: Dispatch<SetStateAction<boolean>>;
  saveFlash: boolean;
  flashSave: () => void;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  filteredNotes: Note[];
  isDesktop: boolean;
};

const NotesUiContext = createContext<NotesUiValue | null>(null);

export function NotesUiProvider({
  children,
  isDesktop,
}: {
  children: ReactNode;
  isDesktop: boolean;
}) {
  const notes = useNotesStore((state) => state.notes);
  const filter = useNotesStore((state) => state.filter);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [query, setQuery] = useState("");
  const saveTimer = useRef<number>(0);

  const flashSave = useCallback(() => {
    setSaveFlash(true);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => setSaveFlash(false), 1600);
  }, []);

  const filteredNotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inFilter = notes.filter((note) => noteMatchesFilter(note, filter));
    const searched = q
      ? inFilter.filter(
          (note) =>
            note.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q),
        )
      : inFilter;
    return sortNotes(searched);
  }, [notes, filter, query]);

  const value = useMemo(
    () => ({
      searchRef,
      titleRef,
      editorRef,
      findRef,
      sidebarOpen,
      setSidebarOpen,
      deleteOpen,
      setDeleteOpen,
      helpOpen,
      setHelpOpen,
      paletteOpen,
      setPaletteOpen,
      findOpen,
      setFindOpen,
      replaceOpen,
      setReplaceOpen,
      saveFlash,
      flashSave,
      query,
      setQuery,
      filteredNotes,
      isDesktop,
    }),
    [
      sidebarOpen,
      deleteOpen,
      helpOpen,
      paletteOpen,
      findOpen,
      replaceOpen,
      saveFlash,
      flashSave,
      query,
      filteredNotes,
      isDesktop,
    ],
  );

  return <NotesUiContext.Provider value={value}>{children}</NotesUiContext.Provider>;
}

export function useNotesUi(): NotesUiValue {
  const ctx = useContext(NotesUiContext);
  if (!ctx) throw new Error("useNotesUi must be used within NotesUiProvider");
  return ctx;
}
