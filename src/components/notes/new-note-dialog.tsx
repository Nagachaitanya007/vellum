import { FileText, PenTool } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useNotesStore } from "@/lib/notes/store";
import { useNotesUi } from "./notes-ui";

export function NewNoteDialog() {
  const createNote = useNotesStore((state) => state.createNote);
  const { newNoteOpen, setNewNoteOpen, titleRef, setSidebarOpen } = useNotesUi();

  function make(kind: "markdown" | "canvas") {
    createNote({ kind });
    setNewNoteOpen(false);
    setSidebarOpen(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  return (
    <Dialog open={newNoteOpen} onOpenChange={setNewNoteOpen}>
      <DialogContent>
        <DialogTitle>New</DialogTitle>
        <DialogDescription className="mt-1">
          A page is markdown. A board is a drawing canvas.
        </DialogDescription>
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            className="flex h-14 items-center gap-3 rounded-md px-3 text-left hover:bg-surface-hover"
            onClick={() => make("markdown")}
          >
            <FileText className="size-5 text-muted" />
            <span>
              <span className="block text-sm font-medium text-fg">Markdown page</span>
              <span className="block text-xs text-muted">Write, preview, diagrams</span>
            </span>
          </button>
          <button
            type="button"
            className="flex h-14 items-center gap-3 rounded-md px-3 text-left hover:bg-surface-hover"
            onClick={() => make("canvas")}
          >
            <PenTool className="size-5 text-muted" />
            <span>
              <span className="block text-sm font-medium text-fg">Canvas board</span>
              <span className="block text-xs text-muted">Sketch, shapes, export PNG or JPEG</span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
