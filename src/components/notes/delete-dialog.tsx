import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { displayTitle } from "@/lib/notes/helpers";
import { useActiveNote, useNotesStore } from "@/lib/notes/store";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotesUi } from "./notes-ui";

export function DeleteDialog() {
  const active = useActiveNote();
  const deleteNote = useNotesStore((state) => state.deleteNote);
  const { deleteOpen, setDeleteOpen } = useNotesUi();

  function confirmDelete() {
    if (!active) return;
    deleteNote(active.id);
    setDeleteOpen(false);
  }

  return (
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this note?</AlertDialogTitle>
          <AlertDialogDescription>
            {active
              ? `“${displayTitle(active.title)}” will be removed from this device. This cannot be undone.`
              : "This note will be removed from this device."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants(), "bg-danger text-fg hover:opacity-90")}
            onClick={confirmDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
