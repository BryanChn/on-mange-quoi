-- « Je pars faire les courses » (validé le 2026-11-25), en boucle complète :
--   1. Le départ : un membre d'un foyer d'au moins 2 personnes le dit ; les autres reçoivent
--      « Bryan part faire les courses. Besoin de quelque chose ? Ajoute-le à la liste. ».
--   2. Le retour : pendant 1 h, ce que les autres ajoutent à la liste prévient celui qui fait
--      les courses, regroupé sur 30 s (« À prendre aussi : lait, œufs. »).
-- Garde-fous : un départ annoncé au plus toutes les 30 min par personne, rien la nuit (22 h à
-- 8 h) pour le départ. Interrupteur « Liste de courses » dans Mon compte.

-- ─── le réglage ─────────────────────────────────────────
alter table public.notification_settings
  add column shopping boolean not null default true;

grant insert (shopping), update (shopping) on public.notification_settings to authenticated;

-- ─── les passages aux courses ───────────────────────────
create table public.shopping_trips (
  id                  uuid primary key default gen_random_uuid(),
  group_id            uuid not null,
  shopper_id          uuid not null,
  started_at          timestamptz not null default now(),
  ends_at             timestamptz not null default now() + interval '1 hour',
  -- false : départ non annoncé (la nuit, ou un autre départ annoncé il y a moins de 30 min).
  announced           boolean not null,
  -- Ajouts des autres pas encore envoyés : posé au premier, envoyé 30 s après.
  added_pending_since timestamptz,
  added_sent_at       timestamptz,
  -- Quitter le foyer, ou son effacement, emportent ses passages.
  foreign key (group_id, shopper_id)
    references public.group_members (group_id, profile_id) on delete cascade
);

create index shopping_trips_group_idx on public.shopping_trips (group_id, ends_at);

alter table public.shopping_trips enable row level security;

-- Le foyer voit qui est aux courses (« Léa est aux courses jusqu'à 19 h 40 »).
create policy "shopping_trips: visibles par le foyer"
  on public.shopping_trips for select
  to authenticated
  using (public.is_group_member(group_id));

-- Aucune écriture directe : start_shopping_trip et end_shopping_trip.
revoke all on public.shopping_trips from anon, authenticated;
grant select on public.shopping_trips to authenticated;

alter publication supabase_realtime add table public.shopping_trips;

-- Partir : un passage en cours est rendu tel quel (deux touchers, deux téléphones), sans
-- nouvelle annonce.
create function public.start_shopping_trip(target_group_id uuid)
returns public.shopping_trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  paris_time time := (now() at time zone 'Europe/Paris')::time;
  trip public.shopping_trips;
begin
  if caller_id is null or not exists (
    select 1 from public.groups as g
    join public.group_members as m on m.group_id = g.id
    where g.id = target_group_id and g.kind = 'foyer' and m.profile_id = caller_id
  ) then
    raise exception 'Foyer introuvable' using errcode = '42501', hint = 'not_member';
  end if;

  if (select count(*) from public.group_members where group_id = target_group_id) < 2 then
    raise exception 'Seul dans le foyer : personne à prévenir'
      using errcode = '22023', hint = 'shopping_alone';
  end if;

  select * into trip from public.shopping_trips
  where group_id = target_group_id and shopper_id = caller_id and ends_at > now()
  order by started_at desc
  limit 1;
  if trip.id is not null then
    return trip;
  end if;

  insert into public.shopping_trips (group_id, shopper_id, announced)
  values (
    target_group_id,
    caller_id,
    paris_time >= time '08:00' and paris_time < time '22:00'
      and not exists (
        select 1 from public.shopping_trips
        where group_id = target_group_id and shopper_id = caller_id
          and announced and started_at > now() - interval '30 minutes'
      )
  )
  returning * into trip;
  return trip;
end;
$$;

revoke execute on function public.start_shopping_trip(uuid) from public, anon;
grant execute on function public.start_shopping_trip(uuid) to authenticated;

-- « J'ai fini » : plus aucun ajout ne prévient.
create function public.end_shopping_trip(target_group_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.shopping_trips
  set ends_at = now()
  where group_id = target_group_id and shopper_id = auth.uid() and ends_at > now()
$$;

revoke execute on function public.end_shopping_trip(uuid) from public, anon;
grant execute on function public.end_shopping_trip(uuid) to authenticated;

-- Le départ annoncé part tout de suite.
create function public.notify_shopping_trip_started()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.announced then
    perform public.call_edge_function(
      'notify-shopping',
      jsonb_build_object('trip_id', new.id, 'kind', 'started')
    );
  end if;
  return null;
end;
$$;

revoke execute on function public.notify_shopping_trip_started() from public, anon, authenticated;

create trigger shopping_trips_notify_started
  after insert on public.shopping_trips
  for each row execute function public.notify_shopping_trip_started();

-- Un article ajouté par quelqu'un d'autre pendant un passage : à envoyer à celui qui y est.
create function public.mark_shopping_addition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.shopping_trips as t
  set added_pending_since = coalesce(t.added_pending_since, now())
  where t.group_id = new.group_id
    and t.ends_at > now()
    and t.shopper_id is distinct from new.added_by;
  return null;
end;
$$;

revoke execute on function public.mark_shopping_addition() from public, anon, authenticated;

create trigger shopping_items_mark_addition
  after insert on public.shopping_items
  for each row execute function public.mark_shopping_addition();

-- Toutes les 30 s : chaque passage en cours dont un ajout attend depuis 30 s est envoyé
-- (« le lait, les œufs » tapés à la suite = une notification). Pas d'heure calme : la
-- personne est en magasin. Les passages de plus d'un jour sont effacés.
create function public.send_shopping_additions(reference_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due record;
  sent_count integer := 0;
begin
  delete from public.shopping_trips where ends_at < reference_time - interval '1 day';

  for due in
    with picked as (
      select t.id, coalesce(t.added_sent_at, t.started_at) as since
      from public.shopping_trips as t
      where t.added_pending_since <= reference_time - interval '30 seconds'
        and t.ends_at > reference_time
      for update skip locked
    )
    update public.shopping_trips as t
    set added_pending_since = null,
        added_sent_at = reference_time
    from picked
    where t.id = picked.id
    returning t.id, picked.since
  loop
    perform public.call_edge_function(
      'notify-shopping',
      jsonb_build_object('trip_id', due.id, 'kind', 'added',
        'since', due.since, 'until', reference_time)
    );
    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

revoke execute on function public.send_shopping_additions(timestamptz) from public, anon, authenticated;
grant execute on function public.send_shopping_additions(timestamptz) to service_role;

select cron.schedule(
  'shopping-additions',
  '30 seconds',
  $$ select public.send_shopping_additions() $$
);
