create table if not exists notes (
  id text not null,
  user_id text not null,
  title text not null default '',
  content text not null default '',
  folder_id text,
  pinned boolean not null default false,
  drawing jsonb not null default '{"strokes":[]}'::jsonb,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

create index if not exists notes_user_updated_idx on notes (user_id, updated_at desc);

create table if not exists vault_settings (
  user_id text primary key,
  folders jsonb not null default '[]'::jsonb,
  updated_at bigint not null
);
