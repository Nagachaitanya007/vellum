import { emptyDrawing } from "./drawing";
import { dailyTitle } from "./helpers";
import type { Drawing, Folder, Note, Stroke } from "./types";

export const DEFAULT_FOLDERS: Folder[] = [
  { id: "folder-personal", name: "Personal" },
  { id: "folder-work", name: "Work" },
  { id: "folder-reading", name: "Reading" },
];

function rainDoodle(): Drawing {
  const strokes: Stroke[] = [];
  for (let i = 0; i < 7; i += 1) {
    const x = -90 + i * 30;
    strokes.push({
      id: `rain-${i}`,
      tool: "pen",
      color: "blue",
      size: 2,
      points: [x, -48, x + 10, 36],
    });
  }
  strokes.push({
    id: "puddle",
    tool: "highlighter",
    color: "highlight",
    size: 18,
    points: [-50, 52, -18, 60, 16, 54, 48, 62, 78, 56],
  });
  return { strokes };
}

function page(
  note: Omit<Note, "drawing" | "pinned" | "folderId" | "kind"> & {
    drawing?: Drawing;
    pinned?: boolean;
    folderId?: string | null;
    kind?: Note["kind"];
  },
): Note {
  return {
    pinned: false,
    folderId: null,
    drawing: emptyDrawing(),
    kind: "markdown",
    ...note,
  };
}

export function seedNotes(now = Date.now()): Note[] {
  const today = dailyTitle(new Date(now));
  return [
    page({
      id: "seed-welcome",
      title: "Welcome to Vellum",
      folderId: null,
      pinned: true,
      createdAt: now - 1000 * 60 * 8,
      updatedAt: now - 1000 * 60 * 8,
      content: `The quiet of Apple Notes, the links of Obsidian, a little Roam, a little Notion.

Sign in from the library to keep this vault on your phone and computer. Notes live on the device until then.

**On the desk**

- Folders, pins, and a paper page
- Vault graph in the library
- Pages for writing, or boards for drawing
- Find and replace in the page
- Light and dark
- Type / at the start of a line for a heading, list, quote, or to-do

Start at [[How linking works]], sketch in [[Rain sketch]], or open [[${today}]].

![[How linking works]]`,
    }),
    page({
      id: "seed-linking",
      title: "How linking works",
      folderId: "folder-personal",
      createdAt: now - 1000 * 60 * 50,
      updatedAt: now - 1000 * 60 * 50,
      content: `Use the Link button, or two brackets, to point at another page: [[Welcome to Vellum]].

A title that does not exist yet becomes a new page. [[Markdown, in brief|The short guide]] can show different words.

Words that match a page title, but are not a link yet, show under the page.

See also [[Field notes — after rain]].

#writing #links`,
    }),
    page({
      id: "seed-markdown",
      title: "Markdown, in brief",
      folderId: "folder-reading",
      createdAt: now - 1000 * 60 * 60 * 5,
      updatedAt: now - 1000 * 60 * 60 * 5,
      content: `Headings, lists, quotes, and links stay on the page. Type / at the start of a line to add one.

## Headings

A large line, a section, or a smaller line.

## Emphasis

**Bold**, *italic*, \`code\`, and ~~struck~~ words.

## Lists

- One
- Two
  - Nested

- [x] Done
- [ ] Next — tap the box

> [!tip]
> A callout is a note set apart from the page.

## Quote

> Keep the measure short. The page should feel like paper, not a dashboard.

A link: [[How linking works]].

==Keep the important line==

#writing`,
    }),
    page({
      id: "seed-field-notes",
      title: "Field notes — after rain",
      folderId: "folder-personal",
      createdAt: now - 1000 * 60 * 60 * 26,
      updatedAt: now - 1000 * 60 * 60 * 26,
      content: `The pavement was still dark when I left. A bus sighed at the corner and the air smelled like wet stone.

I walked without a destination, which is usually when the better sentences show up.

The sketch lives on [[Rain sketch]] — a canvas board, separate from this page.

**Keep**

- The sound of the tray
- Light on the puddle by the curb
- The word *still* in the first line

Related: [[Welcome to Vellum]] and the method in [[How linking works]].

#journal #writing`,
    }),
    page({
      id: "seed-rain-sketch",
      title: "Rain sketch",
      folderId: "folder-personal",
      kind: "canvas",
      drawing: rainDoodle(),
      createdAt: now - 1000 * 60 * 60 * 25,
      updatedAt: now - 1000 * 60 * 60 * 25,
      content: "",
    }),
    page({
      id: "seed-review",
      title: "Weekly review",
      folderId: "folder-work",
      createdAt: now - 1000 * 60 * 60 * 30,
      updatedAt: now - 1000 * 60 * 60 * 3,
      content: `Ship the quiet things. Tick them off as you go.

- [x] Read [[How linking works]]
- [ ] File yesterday into [[Field notes — after rain]]
- [ ] Pin anything that should survive the week
- [ ] Open today's daily note

Welcome to Vellum still needs a quiet pass this week — that sentence is an unlinked mention until you turn it into a link.

#work`,
    }),
    page({
      id: "seed-daily",
      title: today,
      folderId: null,
      createdAt: now - 1000 * 60 * 4,
      updatedAt: now - 1000 * 60 * 4,
      content: `A page for ${today}. Daily notes are a smart list — open Today from the library, or press the shortcut.

- [ ] One true thing
- [ ] One thing to file later

Linked from [[Welcome to Vellum]].

#daily`,
    }),
  ];
}
