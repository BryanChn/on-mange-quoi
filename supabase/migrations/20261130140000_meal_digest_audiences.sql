-- Résumé d'un repas en deux vitesses (retour d'usage du 2026-11-25, remplace la règle
-- unique de meal_digest) :
--   organisateur : environ 1 min après un changement. Il doit savoir tout de suite qui vient
--                  et ce qui est couvert ; la minute regroupe une rafale (« le pain, le vin,
--                  le fromage » tapés à la suite = une notification).
--   les autres   : un résumé regroupé, au plus un toutes les 30 min, seulement à partir de
--                  2 nouveautés. Une info en plus : la liste en direct suffit pour ne pas
--                  apporter deux fois la même chose.
-- Toujours : rien entre 22 h et 8 h (Paris), jamais pour ses propres actions.

-- Marque de l'organisateur, à côté de celle des autres (digest_pending_since, digest_sent_at).
alter table public.groups
  add column owner_digest_pending_since timestamptz,
  add column owner_digest_sent_at timestamptz;

alter table public.groups drop constraint groups_digest_soiree_only;
alter table public.groups add constraint groups_digest_soiree_only check (
  kind = 'soiree' or (
    digest_pending_since is null and digest_sent_at is null
    and owner_digest_pending_since is null and owner_digest_sent_at is null
  )
);

create or replace function public.mark_meal_digest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.groups as g
  set digest_pending_since = coalesce(g.digest_pending_since, now()),
      -- Ce que l'organisateur fait lui-même n'est pas une nouvelle pour lui.
      owner_digest_pending_since = case
        when new.profile_id = g.owner_id then g.owner_digest_pending_since
        else coalesce(g.owner_digest_pending_since, now())
      end
  where g.id = new.group_id
    and g.kind = 'soiree'
    -- Le responsable entre dans son repas à la création : ce n'est pas une nouvelle.
    and not (tg_table_name = 'group_members' and new.profile_id = g.owner_id);
  return null;
end;
$$;

-- Nouveautés d'un repas depuis un instant (null : depuis le début) : arrivées (hors
-- responsable à la création) et apports. Sert au seuil des autres participants.
create function public.meal_news_count(target_group_id uuid, since timestamptz)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.group_members as m
      join public.groups as g on g.id = m.group_id
      where m.group_id = target_group_id and m.profile_id <> g.owner_id
        and (since is null or m.joined_at > since))
    + (select count(*) from public.soiree_contributions as c
      where c.group_id = target_group_id and (since is null or c.created_at > since))
$$;

revoke execute on function public.meal_news_count(uuid, timestamptz) from public, anon, authenticated;

create or replace function public.send_meal_digests(reference_time timestamptz default now())
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

  -- Organisateur : 1 min après le premier changement.
  for due in
    with picked as (
      select g.id, g.owner_digest_sent_at as since
      from public.groups as g
      where g.kind = 'soiree'
        and g.owner_digest_pending_since <= reference_time - interval '1 minute'
      for update skip locked
    )
    update public.groups as g
    set owner_digest_pending_since = null,
        owner_digest_sent_at = reference_time
    from picked
    where g.id = picked.id
    returning g.id, picked.since
  loop
    perform public.call_edge_function(
      'notify-meal',
      jsonb_build_object('group_id', due.id, 'audience', 'owner',
        'since', due.since, 'until', reference_time)
    );
    sent_count := sent_count + 1;
  end loop;

  -- Les autres : 10 min après le premier changement (la rafale des arrivées après le
  -- partage du lien tient dans un seul résumé), 30 min au moins après le précédent, et
  -- 2 nouveautés au moins. Sinon le repas reste marqué : la nouveauté attend la suivante.
  for due in
    with picked as (
      select g.id, g.digest_sent_at as since
      from public.groups as g
      where g.kind = 'soiree'
        and g.digest_pending_since <= reference_time - interval '10 minutes'
        and (g.digest_sent_at is null or g.digest_sent_at <= reference_time - interval '30 minutes')
        and public.meal_news_count(g.id, g.digest_sent_at) >= 2
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
      jsonb_build_object('group_id', due.id, 'audience', 'others',
        'since', due.since, 'until', reference_time)
    );
    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

-- L'organisateur est prévenu en 1 min : la tâche passe toutes les 30 s.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'meal-digests'),
  schedule := '30 seconds'
);
