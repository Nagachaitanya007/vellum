-- Better Auth schema (SQLite / Turso / libSQL).
-- Generated to match Better Auth's sqlite adapter. Do not convert to Postgres.
--
-- Applied by:
--   - `npm run db:migrate` against TURSO_DATABASE_URL (production)
--   - `src/lib/db.ts` on startup against Turso or the local file fallback

create table if not exists "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" integer not null,
  "image" text,
  "createdAt" integer not null,
  "updatedAt" integer not null
);

create table if not exists "session" (
  "id" text not null primary key,
  "expiresAt" integer not null,
  "token" text not null unique,
  "createdAt" integer not null,
  "updatedAt" integer not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

create table if not exists "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" integer,
  "refreshTokenExpiresAt" integer,
  "scope" text,
  "password" text,
  "createdAt" integer not null,
  "updatedAt" integer not null
);

create table if not exists "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" integer not null,
  "createdAt" integer not null,
  "updatedAt" integer not null
);

create index if not exists "session_userId_idx" on "session" ("userId");
create index if not exists "account_userId_idx" on "account" ("userId");
create unique index if not exists "account_provider_account_idx" on "account" ("providerId", "accountId");
create index if not exists "verification_identifier_idx" on "verification" ("identifier");
