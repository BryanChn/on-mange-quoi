-- Tables du vote du MVP (voir docs/schema.md et les règles du vote dans CLAUDE.md).
-- vote_sessions et proposals se référencent mutuellement : la FK du gagnant
-- est ajoutée à la fin, une fois les deux tables créées.

-- ─── types ───────────────────────────────────────────────

-- Cycle de vie d'une session. Un enum plutôt qu'un boolean : d'autres états
-- viendront (heure limite, annulation) et s'ajoutent avec alter type … add value.
create type public.session_status as enum ('open', 'closed');

-- Façon dont le gagnant a été désigné (règles du vote, CLAUDE.md).
create type public.decision_method as enum ('vote', 'tirage', 'organisateur');

-- ─── vote_sessions ───────────────────────────────────────

-- Une décision à prendre dans un groupe. L'organisateur est le membre qui l'a lancée
-- (n'importe quel membre), à ne pas confondre avec l'owner du groupe.
create table public.vote_sessions (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups (id) on delete cascade,
  -- set null : la session reste dans l'historique. Sans on delete explicite,
  -- Postgres refuserait la suppression du compte (no action par défaut).
  organizer_id       uuid references public.profiles (id) on delete set null,
  status             public.session_status not null default 'open',
  -- FK vers proposals ajoutée en fin de fichier (référence circulaire).
  winner_proposal_id uuid,
  decided_by         public.decision_method,
  created_at         timestamptz not null default now(),
  closed_at          timestamptz,
  -- Ouverte : pas encore de résultat. Fermée : résultat complet obligatoire.
  constraint vote_sessions_result_matches_status check (
    (status = 'open'
      and winner_proposal_id is null and decided_by is null and closed_at is null)
    or
    (status = 'closed'
      and winner_proposal_id is not null and decided_by is not null and closed_at is not null)
  )
);

alter table public.vote_sessions enable row level security;

-- ─── proposals ───────────────────────────────────────────

-- Plat soumis au vote, en texte libre.
create table public.proposals (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.vote_sessions (id) on delete cascade,
  name        varchar(60) not null check (length(trim(name)) > 0),
  -- set null : si l'auteur supprime son compte, le plat et ses votes restent.
  proposed_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- « Pizza », « pizza » et « Pizza  » sont le même plat dans une session.
-- L'app intercepte l'erreur pour proposer de voter pour le plat existant.
create unique index proposals_session_name_unique
  on public.proposals (session_id, lower(trim(name)));

alter table public.proposals enable row level security;

-- ─── votes ───────────────────────────────────────────────

-- Une ligne = « ce profil a coché ce plat ». Pas de compteur : le score = count(*).
-- Décocher = supprimer sa ligne.
create table public.votes (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (proposal_id, profile_id)
);

alter table public.votes enable row level security;

-- ─── gagnant d'une session ───────────────────────────────

-- Cible de la FK composée ci-dessous : (id, session_id) doit être unique.
alter table public.proposals
  add constraint proposals_id_session_unique unique (id, session_id);

-- Le gagnant doit être une proposition de LA MÊME session.
-- no action : impossible de supprimer le plat gagnant (même à 0 vote, cas du tirage),
-- mais vérifié en fin d'instruction, pour que la suppression d'un groupe en cascade passe.
alter table public.vote_sessions
  add constraint vote_sessions_winner_fk
  foreign key (winner_proposal_id, id)
  references public.proposals (id, session_id)
  on delete no action;
