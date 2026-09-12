-- Ensure the same Google account (providerId + accountId) maps to one Vellum user.
-- Safe to re-run: drops the non-unique index from early 0001_auth.sql copies.

drop index if exists "account_provider_account_idx";
create unique index if not exists "account_provider_account_idx" on "account" ("providerId", "accountId");
