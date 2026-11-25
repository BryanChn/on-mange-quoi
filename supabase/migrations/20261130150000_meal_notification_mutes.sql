-- Couper les notifications d'un seul repas (validé le 2026-11-25) : un interrupteur « Me
-- tenir au courant » sur l'écran du repas, activé par défaut. On suit son dîner de Noël, on
-- coupe la grosse soirée d'un collègue, sans toucher au réglage général de Mon compte.
-- Couvre tout le repas : ses votes (notify-vote) et son résumé (notify-meal).
--
-- Une ligne = ce repas est coupé pour ce membre. Pas de ligne = activé. Liée au membre du
-- repas : quitter le repas, en être retiré ou son effacement emportent la ligne.
create table public.meal_notification_mutes (
  group_id   uuid not null,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id),
  foreign key (group_id, profile_id)
    references public.group_members (group_id, profile_id) on delete cascade
);

alter table public.meal_notification_mutes enable row level security;

-- Chacun ne voit, ne crée et ne retire que les siennes.
create policy "meal_notification_mutes: lues par soi"
  on public.meal_notification_mutes for select
  to authenticated
  using (profile_id = (select auth.uid()));

-- Seulement dans un repas dont on est membre (la clé étrangère l'exige déjà), jamais un foyer.
create policy "meal_notification_mutes: créées par soi, dans un repas"
  on public.meal_notification_mutes for insert
  to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.groups as g
      where g.id = group_id and g.kind = 'soiree'
    )
  );

create policy "meal_notification_mutes: retirées par soi"
  on public.meal_notification_mutes for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- Droits par colonne : l'app écrit le repas et elle-même ; la date vient du défaut.
revoke all on public.meal_notification_mutes from anon, authenticated;
grant select, delete on public.meal_notification_mutes to authenticated;
grant insert (group_id, profile_id) on public.meal_notification_mutes to authenticated;
