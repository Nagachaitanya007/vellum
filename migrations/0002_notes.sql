-- Vellum vault (SQLite / Turso). Every row is owned by user_id.
-- drawing and folders are JSON stored as text.

create table if not exists notes (
  id text not null,
  user_id text not null,
  title text not null default '',
  content text not null default '',
  folder_id text,
  pinned integer not null default 0,
  kind text not null default 'markdown',
  drawing text not null default '{"strokes":[]}',
  created_at integer not null,
  updated_at integer not null,
  deleted_at integer,
  primary key (user_id, id)
);

create index if not exists notes_user_updated_idx on notes (user_id, updated_at desc);

create table if not exists vault_settings (
  user_id text primary key,
  folders text not null default '[]',
  updated_at integer not null
);
