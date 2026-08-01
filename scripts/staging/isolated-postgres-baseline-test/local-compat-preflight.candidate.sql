-- LOCAL COMPATIBILITY PREFLIGHT CANDIDATE
-- LOCAL ONLY: not a migration, not production, not remote staging.

CREATE SCHEMA auth;

CREATE SCHEMA storage;

CREATE SCHEMA extensions;

CREATE EXTENSION pgcrypto WITH SCHEMA extensions;

-- LOCAL COMPATIBILITY ROLE: referenced by baseline privileges only.
CREATE ROLE anon
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- LOCAL COMPATIBILITY ROLE: referenced by baseline privileges only.
CREATE ROLE authenticated
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- LOCAL COMPATIBILITY ROLE: referenced by baseline privileges only.
CREATE ROLE postgres
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- LOCAL COMPATIBILITY ROLE: referenced by baseline privileges only.
CREATE ROLE service_role
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION;

-- LOCAL TEST STUB: empty compatibility table for a referenced Auth relation.
CREATE TABLE auth.users (
  id uuid PRIMARY KEY
);

-- LOCAL TEST STUB: empty compatibility table for a referenced Storage relation.
CREATE TABLE storage.objects ();
