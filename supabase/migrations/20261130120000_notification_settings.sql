-- Réglages des notifications (tranché le 2026-11-25, CLAUDE.md « Notifications d'un repas ») :
-- deux interrupteurs dans Mon compte, « Votes » (un foyer) et « Repas à plusieurs ».
-- Activés par défaut : pas de ligne = tout est activé. Une notification qu'il faut activer
-- soi-même, presque personne ne l'active.
--
-- Une table à part plutôt que deux colonnes sur profiles : un profil est lisible par tous les
-- co-membres (« Maman a voté »), un réglage ne regarde que soi. Le serveur (notify-vote, clé
-- service_role) les lit pour ne pas prévenir qui a coupé : rien n'est envoyé, rien à cacher
-- sur le téléphone.
create table public.notification_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  votes      boolean not null default true,
  meals      boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_settings enable row level security;

-- Chacun ne voit et ne modifie que sa ligne.
create policy "notification_settings: lus par soi"
  on public.notification_settings for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "notification_settings: créés par soi"
  on public.notification_settings for insert
  to authenticated
  with check (profile_id = (select auth.uid()));

create policy "notification_settings: modifiés par soi"
  on public.notification_settings for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Droits par colonne (restrict_column_privileges) : l'app écrit ses deux interrupteurs.
-- upsert = insert … on conflict do update : update sur profile_id est requis, la RLS empêche
-- de le changer. updated_at vient du trigger, jamais de l'app. Pas de delete : la ligne part
-- avec le compte (cascade).
revoke all on public.notification_settings from anon, authenticated;
grant select on public.notification_settings to authenticated;
grant insert (profile_id, votes, meals), update (profile_id, votes, meals)
  on public.notification_settings to authenticated;

create function public.touch_notification_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.touch_notification_settings() from public, anon, authenticated;

create trigger notification_settings_touch
  before update on public.notification_settings
  for each row execute function public.touch_notification_settings();
