-- Comptes et groupes du MVP (voir docs/schema.md).
-- Les politiques RLS sont dans une migration séparée ; sans politique,
-- une table avec RLS activée est fermée à tout le monde (refus par défaut).

-- ─── profiles ────────────────────────────────────────────

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name varchar(30) not null check (length(trim(display_name)) > 0),
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ─── groups ──────────────────────────────────────────────

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(50) not null check (length(trim(name)) > 0),
  -- restrict : l'ownership doit être transféré avant de supprimer le compte.
  owner_id    uuid not null references public.profiles (id) on delete restrict,
  -- Généré côté serveur (fonction à venir), jamais par l'app.
  invite_code varchar(12) not null unique,
  created_at  timestamptz not null default now()
);

alter table public.groups enable row level security;

-- ─── group_members ───────────────────────────────────────

-- Table de jointure profils <-> groupes. L'owner y figure aussi.
create table public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Sert au transfert d'ownership : au membre le plus ancien.
  joined_at  timestamptz not null default now(),
  primary key (group_id, profile_id)
);

alter table public.group_members enable row level security;

