-- Repas à plusieurs, trois façons (suite de meal_modes_types) : le type et la date d'un
-- repas, le sujet de chaque vote, plusieurs votes ouverts en même temps (un par sujet),
-- « qui apporte quoi », et l'effacement 24 h après la date du repas.
-- Tout reste compatible avec l'app d'avant : un repas sans type est un repas « commande ».

-- ─── groupes : type et date d'un repas ───────────────────
alter table public.groups
  add column soiree_mode public.soiree_mode,
  -- Le jour du repas (heure de Paris) : il est effacé 24 h après. Null pour les repas créés
  -- avant cette migration (ancienne règle : 7 jours après la création).
  add column meal_date date;

update public.groups set soiree_mode = 'commande' where kind = 'soiree';

-- Un foyer n'a aucune donnée de repas. Un repas a un type, une étape et un lien ; chaque type
-- a ses étapes : commande (choix → commande → passee), resto et maison (choix → decide).
alter table public.groups drop constraint groups_kind_check;
alter table public.groups add constraint groups_kind_check check (
  (kind = 'foyer' and soiree_step is null and soiree_mode is null and meal_date is null
    and restaurant is null and ordered_at is null and join_token is null)
  or (kind = 'soiree' and soiree_step is not null and soiree_mode is not null
    and join_token is not null
    and ((soiree_step = 'passee') = (ordered_at is not null))
    and (
      (soiree_mode = 'commande' and soiree_step in ('choix', 'commande', 'passee')
        and (soiree_step = 'choix' or restaurant is not null))
      or (soiree_mode = 'resto' and soiree_step in ('choix', 'decide')
        and (soiree_step = 'choix' or restaurant is not null))
      or (soiree_mode = 'maison' and soiree_step in ('choix', 'decide') and restaurant is null)
    ))
);

-- ─── votes : un sujet, un vote ouvert par sujet ──────────
alter table public.vote_sessions add column topic public.vote_topic;

update public.vote_sessions s
set topic = case when g.kind = 'soiree' then 'resto'::public.vote_topic else 'plat' end
from public.groups g
where g.id = s.group_id;

alter table public.vote_sessions
  alter column topic set default 'plat',
  alter column topic set not null;

-- Avant : un seul vote ouvert par groupe. Maintenant : un par sujet (plat et dessert en même
-- temps, jamais deux votes « plat »). Un foyer et un repas « commande » ou « resto » n'ont
-- qu'un sujet : pour eux, rien ne change.
drop index public.vote_sessions_one_open_per_group;
create unique index vote_sessions_one_open_per_topic
  on public.vote_sessions (group_id, topic)
  where status = 'open';

-- Le sujet vient du serveur, jamais de l'app (pas de droit d'insertion sur topic) : un repas
-- « commande » ou « resto » vote un resto. Un repas « maison » reçoit ses votes de
-- create_soiree, avec leur sujet ; un foyer garde la valeur par défaut, « plat ».
create function public.set_vote_session_topic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.groups g
    where g.id = new.group_id and g.kind = 'soiree' and g.soiree_mode <> 'maison'
  ) then
    new.topic := 'resto';
  end if;
  return new;
end;
$$;

revoke execute on function public.set_vote_session_topic() from public, anon, authenticated;

create trigger vote_sessions_set_topic
  before insert on public.vote_sessions
  for each row execute function public.set_vote_session_topic();

-- Lancer un vote depuis l'app : un foyer, ou un repas « commande » / « resto » à l'étape
-- « choix ». Le menu d'un repas « maison » est ouvert par create_soiree, pas par l'app.
drop policy "vote_sessions: lancées par un membre" on public.vote_sessions;

create policy "vote_sessions: lancées par un membre"
  on public.vote_sessions for insert
  to authenticated
  with check (
    organizer_id = (select auth.uid())
    and public.is_group_member(group_id)
    and status = 'open'
    and not public.is_anonymous_user()
    and exists (
      select 1 from public.groups g
      where g.id = group_id
        and (g.kind = 'foyer'
          or (g.soiree_step = 'choix' and g.soiree_mode in ('commande', 'resto')))
    )
  );

-- ─── fin d'un vote de repas ──────────────────────────────
-- Avant : le gagnant devenait le resto et la commande s'ouvrait. Selon le type maintenant :
--   commande : comme avant ;
--   resto    : le gagnant devient le resto, et c'est décidé ;
--   maison   : décidé quand plus aucun vote du menu n'est ouvert.
-- for update sur le repas : deux votes du menu terminés au même instant passent l'un après
-- l'autre, et le second voit bien que plus rien n'est ouvert.
create or replace function public.open_soiree_ordering()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  soiree public.groups;
  winner_name text;
begin
  select * into soiree
  from public.groups
  where id = new.group_id and kind = 'soiree' and soiree_step = 'choix'
  for update;

  if soiree.id is null then
    return null;
  end if;

  if soiree.soiree_mode = 'maison' then
    if not exists (
      select 1 from public.vote_sessions
      where group_id = soiree.id and status = 'open'
    ) then
      update public.groups set soiree_step = 'decide' where id = soiree.id;
    end if;
    return null;
  end if;

  select name into winner_name from public.proposals where id = new.winner_proposal_id;
  if winner_name is null then
    return null;
  end if;

  update public.groups
  set restaurant = winner_name,
      soiree_step = (case when soiree.soiree_mode = 'resto' then 'decide' else 'commande' end)::public.soiree_step
  where id = soiree.id;

  return null;
end;
$$;

-- ─── choose_restaurant ───────────────────────────────────
-- Le responsable fixe le resto sans vote : la commande s'ouvre (commande), ou c'est décidé
-- (resto). Un repas « maison » n'a pas de resto.
create or replace function public.choose_restaurant(target_group_id uuid, restaurant_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  soiree public.groups;
begin
  select * into soiree
  from public.groups
  where id = target_group_id and kind = 'soiree' and owner_id = caller_id
  for update;

  if soiree.id is null then
    raise exception 'Soirée introuvable ou tu n''en es pas responsable' using errcode = 'P0002';
  end if;

  if soiree.soiree_mode = 'maison' then
    raise exception 'Un repas chez quelqu''un n''a pas de resto'
      using errcode = '55000', hint = 'mode_mismatch';
  end if;

  if soiree.soiree_step <> 'choix' then
    raise exception 'Le resto est déjà choisi' using errcode = '55000', hint = 'step_mismatch';
  end if;

  if exists (
    select 1 from public.vote_sessions
    where group_id = target_group_id and status = 'open'
  ) then
    raise exception 'Un vote est en cours' using errcode = '55000', hint = 'vote_open';
  end if;

  update public.groups
  set restaurant = trim(restaurant_name),
      soiree_step = (case when soiree.soiree_mode = 'resto' then 'decide' else 'commande' end)::public.soiree_step
  where id = target_group_id
  returning * into soiree;

  return soiree;
end;
$$;

-- ─── create_soiree : type, menu, date ────────────────────
-- Remplace create_soiree(text) : avec ses valeurs par défaut, l'appel d'avant
-- (create_soiree(soiree_name)) crée toujours un repas « commande » pour aujourd'hui.
--   resto  : le vote du resto s'ouvre tout de suite ;
--   maison : un vote par sujet coché s'ouvre tout de suite ; sans sujet, c'est déjà décidé
--            (il reste « qui apporte quoi »).
drop function public.create_soiree(text);

create function public.create_soiree(
  soiree_name text,
  meal_mode public.soiree_mode default 'commande',
  vote_topics public.vote_topic[] default '{}',
  on_date date default null
)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  paris_today date := (now() at time zone 'Europe/Paris')::date;
  chosen_date date := coalesce(on_date, (now() at time zone 'Europe/Paris')::date);
  new_group public.groups;
  menu_topic public.vote_topic;
begin
  if caller_id is null or public.is_anonymous_user() then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- Pas de repas dans le passé, ni dans plus de 6 mois (rien ne traîne en base).
  if chosen_date < paris_today or chosen_date > paris_today + 183 then
    raise exception 'Date du repas invalide' using errcode = '22023', hint = 'invalid_date';
  end if;

  if meal_mode = 'maison' and 'resto' = any (vote_topics) then
    raise exception 'Un repas chez quelqu''un ne vote pas de resto'
      using errcode = '22023', hint = 'invalid_topic';
  end if;

  for attempt in 1..5 loop
    begin
      insert into public.groups (
        name, owner_id, invite_code, kind, soiree_step, soiree_mode, meal_date, join_token
      )
      values (
        trim(soiree_name), caller_id, public.generate_invite_code(),
        'soiree', 'choix', meal_mode, chosen_date, public.generate_join_token()
      )
      returning * into new_group;
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.group_members (group_id, profile_id)
  values (new_group.id, caller_id);

  if meal_mode = 'resto' then
    insert into public.vote_sessions (group_id, organizer_id)
    values (new_group.id, caller_id);
  elsif meal_mode = 'maison' then
    -- Un vote par sujet, sans doublon, dans l'ordre d'un repas (apéro, entrée, plat, dessert).
    for menu_topic in
      select distinct t from unnest(vote_topics) as t
      order by t
    loop
      insert into public.vote_sessions (group_id, organizer_id, topic)
      values (new_group.id, caller_id, menu_topic);
    end loop;

    if cardinality(vote_topics) = 0 then
      update public.groups set soiree_step = 'decide' where id = new_group.id;
    end if;
  end if;

  select * into new_group from public.groups where id = new_group.id;
  return new_group;
end;
$$;

revoke execute on function public.create_soiree(text, public.soiree_mode, public.vote_topic[], date)
  from public, anon;
grant execute on function public.create_soiree(text, public.soiree_mode, public.vote_topic[], date)
  to authenticated;

-- ─── qui apporte quoi ────────────────────────────────────
-- Repas « maison » : chacun dit ce qu'il apporte (« le vin »), visible en direct. Même modèle
-- que order_items : une ligne appartient à un membre ; retiré du repas, ses lignes partent.
create table public.soiree_contributions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null,
  profile_id uuid not null default auth.uid(),
  label      varchar(80) not null check (length(trim(label)) > 0),
  created_at timestamptz not null default now(),
  foreign key (group_id, profile_id)
    references public.group_members (group_id, profile_id) on delete cascade
);

create index soiree_contributions_group_idx on public.soiree_contributions (group_id);

alter table public.soiree_contributions enable row level security;

-- Droits par colonne : l'app écrit ce qu'on apporte ; l'auteur vient du compte connecté.
revoke insert, update on public.soiree_contributions from anon, authenticated;
grant insert (group_id, label) on public.soiree_contributions to authenticated;
grant update (label) on public.soiree_contributions to authenticated;

create policy "soiree_contributions: visibles par les membres du repas"
  on public.soiree_contributions for select
  to authenticated
  using (public.is_group_member(group_id));

-- Invités compris (ils sont membres de leur repas), seulement dans un repas « maison ».
create policy "soiree_contributions: ajoutées par un membre, en son nom"
  on public.soiree_contributions for insert
  to authenticated
  with check (
    profile_id = (select auth.uid())
    and public.is_group_member(group_id)
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.kind = 'soiree' and g.soiree_mode = 'maison'
    )
  );

create policy "soiree_contributions: modifiées par leur auteur"
  on public.soiree_contributions for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "soiree_contributions: retirées par leur auteur ou le responsable"
  on public.soiree_contributions for delete
  to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.owner_id = (select auth.uid())
    )
  );

alter publication supabase_realtime add table public.soiree_contributions;

-- ─── effacement ──────────────────────────────────────────
-- Rien n'est gardé sans raison (RGPD) :
--   - repas commandé depuis 24 h (l'historique promis) ;
--   - repas daté : effacé 24 h après son jour (à partir du surlendemain, heure de Paris) ;
--   - repas sans date (créé avant cette migration) : 7 jours après sa création ;
--   - compte anonyme qui n'est plus dans aucun groupe (1 h de délai, comme avant).
create or replace function public.purge_soirees(reference_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_count integer;
  paris_today date := (reference_time at time zone 'Europe/Paris')::date;
begin
  delete from public.groups
  where kind = 'soiree'
    and (
      (soiree_step = 'passee' and ordered_at <= reference_time - interval '24 hours')
      or (meal_date is not null and meal_date < paris_today - 1)
      or (meal_date is null and created_at <= reference_time - interval '7 days')
    );
  get diagnostics purged_count = row_count;

  delete from auth.users u
  where u.is_anonymous
    and u.created_at <= reference_time - interval '1 hour'
    and not exists (select 1 from public.group_members m where m.profile_id = u.id);

  return purged_count;
end;
$$;

-- ─── rappel unique : un par repas ────────────────────────
-- Même fonction qu'avant (vote_reminders), avec une condition de plus : un repas « maison »
-- a plusieurs votes ouverts, mais un seul rappel part, pour le premier vote du groupe.
create or replace function public.send_vote_reminders(reference_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  paris_time time := (reference_time at time zone 'Europe/Paris')::time;
  reminded_session_id uuid;
  reminded_count integer := 0;
begin
  if paris_time < time '10:00' or paris_time >= time '21:00' then
    return 0;
  end if;

  for reminded_session_id in
    update public.vote_sessions as s
    set reminder_sent_at = reference_time
    where s.status = 'open'
      and s.reminder_sent_at is null
      and s.created_at <= reference_time - interval '1 hour'
      and s.created_at > reference_time - interval '3 hours'
      -- Un seul rappel par groupe : aucun autre vote du groupe déjà relancé, et celui-ci
      -- est le premier ouvert.
      and not exists (
        select 1 from public.vote_sessions as o
        where o.group_id = s.group_id and o.id <> s.id and o.reminder_sent_at is not null
          and o.status = 'open'
      )
      and s.id = (
        select o.id from public.vote_sessions as o
        where o.group_id = s.group_id and o.status = 'open'
        order by o.created_at, o.id
        limit 1
      )
      and exists (
        select 1
        from public.group_members as m
        where m.group_id = s.group_id
          and m.profile_id is distinct from s.organizer_id
          and not exists (
            select 1 from public.proposals as p
            where p.session_id = s.id and p.proposed_by = m.profile_id
          )
          and not exists (
            select 1
            from public.votes as v
            join public.proposals as p on p.id = v.proposal_id
            where p.session_id = s.id and v.profile_id = m.profile_id
          )
      )
    returning s.id
  loop
    perform public.call_edge_function(
      'notify-vote',
      jsonb_build_object('session_id', reminded_session_id, 'event', 'reminder')
    );
    reminded_count := reminded_count + 1;
  end loop;

  return reminded_count;
end;
$$;
