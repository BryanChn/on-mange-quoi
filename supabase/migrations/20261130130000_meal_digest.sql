-- Résumé d'un repas (tranché le 2026-11-25, CLAUDE.md « Notifications d'un repas ») : savoir
-- qui rejoint et qui apporte quoi, sans une notification par événement. Une seule
-- notification regroupée, environ 10 min après le premier changement :
-- « Léa et Tom ont rejoint. Léa apporte : le pain. »
--
--   1. Une arrivée (group_members) ou un apport (soiree_contributions) marque le repas :
--      digest_pending_since, posé au premier changement et pas déplacé par les suivants.
--   2. pg_cron lance send_meal_digests() toutes les 2 min : chaque repas marqué depuis
--      10 min ou plus est démarqué, et notify-meal reçoit la fenêtre (depuis le dernier
--      résumé, jusqu'à maintenant).
--   3. notify-meal relit la fenêtre en base et écrit à chacun ce que les AUTRES ont fait
--      (réglage « Repas à plusieurs » respecté).

alter table public.groups
  add column digest_pending_since timestamptz,
  add column digest_sent_at timestamptz;

-- Un foyer n'a jamais de résumé.
alter table public.groups add constraint groups_digest_soiree_only check (
  kind = 'soiree' or (digest_pending_since is null and digest_sent_at is null)
);

-- Les colonnes ne sont pas accordées à l'app (restrict_column_privileges) : seuls ce
-- trigger et send_meal_digests les écrivent.
create function public.mark_meal_digest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.groups as g
  set digest_pending_since = coalesce(g.digest_pending_since, now())
  where g.id = new.group_id
    and g.kind = 'soiree'
    -- Le responsable entre dans son repas à la création : ce n'est pas une nouvelle.
    and not (tg_table_name = 'group_members' and new.profile_id = g.owner_id);
  return null;
end;
$$;

revoke execute on function public.mark_meal_digest() from public, anon, authenticated;

create trigger group_members_mark_meal_digest
  after insert on public.group_members
  for each row execute function public.mark_meal_digest();

create trigger soiree_contributions_mark_meal_digest
  after insert on public.soiree_contributions
  for each row execute function public.mark_meal_digest();

-- Pas la nuit (22 h à 8 h, Paris) : le repas reste marqué, et le résumé part à 8 h avec tout
-- ce qui s'est passé. reference_time sert aux tests.
-- for update skip locked : deux exécutions qui se chevauchent ne prennent jamais le même repas.
create function public.send_meal_digests(reference_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  paris_time time := (reference_time at time zone 'Europe/Paris')::time;
  due record;
  sent_count integer := 0;
begin
  if paris_time < time '08:00' or paris_time >= time '22:00' then
    return 0;
  end if;

  for due in
    with picked as (
      select g.id, g.digest_sent_at as since
      from public.groups as g
      where g.kind = 'soiree'
        and g.digest_pending_since <= reference_time - interval '10 minutes'
      for update skip locked
    )
    update public.groups as g
    set digest_pending_since = null,
        digest_sent_at = reference_time
    from picked
    where g.id = picked.id
    returning g.id, picked.since
  loop
    perform public.call_edge_function(
      'notify-meal',
      jsonb_build_object('group_id', due.id, 'since', due.since, 'until', reference_time)
    );
    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

revoke execute on function public.send_meal_digests(timestamptz) from public, anon, authenticated;
grant execute on function public.send_meal_digests(timestamptz) to service_role;

select cron.schedule(
  'meal-digests',
  '*/2 * * * *',
  $$ select public.send_meal_digests() $$
);
