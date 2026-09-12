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
- Markdown pages or canvas boards — choose when you create
- Find and replace in the page
- Light and dark
- \`/\` for blocks, like Notion. Try \`/seq\`, \`/flow\`, \`/math\`, \`/mark\`, \`/today\`

Start at [[How linking works]], sketch in [[Rain sketch]], or open [[${today}]].

![[How linking works]]`,
    }),
    page({
      id: "seed-linking",
      title: "How linking works",
      folderId: "folder-personal",
      createdAt: now - 1000 * 60 * 50,
      updatedAt: now - 1000 * 60 * 50,
      content: `Type two brackets to reach another page: [[Welcome to Vellum]].

Following a missing title creates it. An alias works too: [[Markdown, in brief|the markdown primer]].

Unlinked mentions (Roam) show under the page — plain text that matches a title, waiting to become a link.

Embed a page with \`![[Welcome to Vellum]]\`.

#writing #links

See also [[Field notes — after rain]].`,
    }),
    page({
      id: "seed-markdown",
      title: "Markdown, in brief",
      folderId: "folder-reading",
      createdAt: now - 1000 * 60 * 60 * 5,
      updatedAt: now - 1000 * 60 * 60 * 5,
      content: `Use these marks in the editor. Type \`/\` at the start of a line for Notion-style blocks.

## Headings

\`# Large\` · \`## Section\` · \`### Small\`

## Emphasis

**Bold**, *italic*, \`inline code\`, and ~~struck~~.

## Lists

- One
- Two
  - Nested

- [x] Done
- [ ] Next — tick this in preview

> [!tip]
> Callouts start with \`> [!note]\`, \`> [!tip]\`, or \`> [!warn]\`.

## Quote

> Keep the measure short. The page should feel like paper, not a dashboard.

A wiki link: [[How linking works]].

Type \`/\` then seq, flow, math, mark, or today.

\`\`\`seq
Ada->Grace: Compile
Grace-->Ada: Ship
\`\`\`

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
      content: `Ship the quiet things. Tick them off in preview.

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
