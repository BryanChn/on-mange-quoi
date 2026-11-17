-- Reçus des notifications push. Expo répond en deux temps : un ticket tout de suite, puis un
-- reçu une fois le message remis à FCM (environ 15 min, gardé 24 h). Un jeton mort peut
-- n'apparaître que dans le reçu : sans ce suivi, on le relancerait à chaque vote.
-- notify-vote enregistre ici les tickets acceptés ; push-receipts, appelée par pg_cron,
-- lit leurs reçus, supprime les jetons morts, puis les tickets traités ou expirés.

create table public.push_tickets (
  -- Identifiant du ticket donné par Expo.
  id text primary key,
  -- Supprimer le jeton (déconnexion, compte supprimé, jeton mort) supprime ses tickets.
  token varchar(255) not null references public.push_tokens (token) on delete cascade,
  created_at timestamptz not null default now()
);

-- push-receipts cherche les tickets assez anciens pour avoir un reçu, et purge les expirés.
create index push_tickets_created_at_idx on public.push_tickets (created_at);
-- Clé étrangère : sans index, chaque suppression de jeton parcourrait toute la table.
create index push_tickets_token_idx on public.push_tickets (token);

-- RLS sans politique + aucun droit : invisible pour l'app. Seule la clé service_role
-- (Edge Functions) y accède.
alter table public.push_tickets enable row level security;
revoke all on public.push_tickets from anon, authenticated;

-- ─── Passage planifié ────────────────────────────────────
-- pg_cron : planificateur dans Postgres. Toutes les 30 min, la base appelle push-receipts.
-- Sans Vault configuré, call_edge_function ne fait rien (base locale).
create extension if not exists pg_cron;

select cron.schedule(
  'push-receipts',
  '*/30 * * * *',
  $$ select public.call_edge_function('push-receipts', '{}'::jsonb) $$
);
