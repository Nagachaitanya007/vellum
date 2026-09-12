import { SLASH_ITEMS } from "@/lib/notes/helpers";
import { cn } from "@/lib/utils";

export function SlashMenu({
  query,
  index,
  onPick,
}: {
  query: string;
  index: number;
  onPick: (insert: string) => void;
}) {
  const items = SLASH_ITEMS.filter((item) => {
    const q = query.toLowerCase();
    return item.label.toLowerCase().includes(q) || item.id.includes(q) || item.hint.includes(q);
  }).slice(0, 8);
  if (items.length === 0) return null;
  const safe = items.length ? index % items.length : 0;

  return (
    <ul
      className="absolute bottom-6 left-5 z-10 w-72 overflow-hidden rounded-md bg-raised text-fg shadow-border md:left-10"
      role="listbox"
      aria-label="Insert block"
    >
      {items.map((item, i) => (
        <li key={item.id}>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between px-3 py-2 text-left text-sm",
              i === safe ? "bg-surface-hover" : "hover:bg-surface",
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(item.insert);
            }}
          >
            <span>{item.label}</span>
            <span className="font-mono text-xs text-subtle">{item.hint}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function slashItemsFor(query: string) {
  const q = query.toLowerCase();
  return SLASH_ITEMS.filter(
    (item) => item.label.toLowerCase().includes(q) || item.id.includes(q) || item.hint.includes(q),
  ).slice(0, 8);
}
