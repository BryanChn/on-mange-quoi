-- Soirées et commande groupée (V1, tranché le 2026-11-23 ; étude :
-- https://claude.ai/artifact/7GqZQEu78cCoVNV2refUQ7).
--
-- Une soirée est un groupe éphémère : on la rejoint par un lien, avec son compte ou avec
-- un simple pseudo (connexion anonyme), on décide où on mange (vote, ou resto fixé par le
-- responsable), puis chacun écrit sa commande. Le responsable passe la commande : tout se
-- fige, la soirée reste lisible 24 h, puis elle est effacée avec les comptes invités.
--
-- Une soirée réutilise groups et group_members : les invités en deviennent membres, donc
-- les règles d'accès existantes (is_group_member) les couvrent, vote compris.
--
-- Étapes : choix → commande → passee. Chaque passage passe par une fonction qui refuse
-- les autres ; l'app n'écrit jamais ces colonnes (droits par colonne).

-- ─── utilisateurs anonymes ───────────────────────────────
-- Un compte anonyme (invité d'une soirée) a le rôle authenticated, comme un vrai compte :
-- toutes les règles « être connecté » le laissent passer. Il ne doit pouvoir que rejoindre
-- une soirée par son lien et y participer. Les fonctions et règles concernées appellent ceci.
create function public.is_anonymous_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

revoke execute on function public.is_anonymous_user() from public, anon;
grant execute on function public.is_anonymous_user() to authenticated;

-- ─── groupes : type, étape, resto, lien ──────────────────
create type public.group_kind as enum ('foyer', 'soiree');
create type public.soiree_step as enum ('choix', 'commande', 'passee');

alter table public.groups
  add column kind public.group_kind not null default 'foyer',
  add column soiree_step public.soiree_step,
  -- Fixé par le responsable, ou nom du plat gagnant du vote « Où on mange ? ».
  add column restaurant varchar(60) check (length(trim(restaurant)) > 0),
  -- Départ des 24 h d'historique.
  add column ordered_at timestamptz,
  -- Jeton du lien partagé : 128 bits, impossible à deviner. Distinct d'invite_code
  -- (8 caractères, environ 40 bits) : le lien circule en clair et laisse entrer sans compte.
  add column join_token text unique,
  -- Un foyer n'a aucune donnée de soirée ; une soirée a toujours une étape et un lien.
  add constraint groups_kind_check check (
    (kind = 'foyer' and soiree_step is null and restaurant is null
      and ordered_at is null and join_token is null)
    or (kind = 'soiree' and soiree_step is not null and join_token is not null
      -- Pas de commande sans resto ; « passée » si et seulement si elle a une date.
      and (soiree_step = 'choix' or restaurant is not null)
      and ((soiree_step = 'passee') = (ordered_at is not null)))
  );

-- Pour la purge horaire.
create index groups_soiree_idx on public.groups (kind, soiree_step) where kind = 'soiree';

-- ─── order_items ─────────────────────────────────────────
create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null,
  profile_id uuid not null default auth.uid(),
  label      varchar(80) not null check (length(trim(label)) > 0),
  quantity   smallint not null default 1 check (quantity between 1 and 20),
  note       varchar(120) check (length(trim(note)) > 0),
  created_at timestamptz not null default now(),
  -- Une ligne appartient à un membre de la soirée : retiré de la soirée (par le responsable
  -- ou en partant), ses lignes partent avec lui.
  foreign key (group_id, profile_id)
    references public.group_members (group_id, profile_id) on delete cascade
);

create index order_items_group_idx on public.order_items (group_id);

alter table public.order_items enable row level security;

-- Droits par colonne (comme restrict_column_privileges) : l'app choisit le contenu de la
-- ligne, jamais son id ni sa date. profile_id est vérifié par la RLS (= auth.uid()).
revoke insert, update on public.order_items from anon, authenticated;
grant insert (group_id, profile_id, label, quantity, note) on public.order_items to authenticated;
grant update (label, quantity, note) on public.order_items to authenticated;

-- Les règles disent QUI ; QUAND (étape « commande ») est vérifié par le trigger plus bas,
-- qui renvoie une erreur claire au lieu de filtrer la ligne en silence.
create policy "order_items: visibles par les membres de la soirée"
  on public.order_items for select
  to authenticated
  using (public.is_group_member(group_id));

create policy "order_items: ajoutées par un membre, en son nom"
  on public.order_items for insert
  to authenticated
  with check (profile_id = (select auth.uid()) and public.is_group_member(group_id));

create policy "order_items: modifiées par leur auteur"
  on public.order_items for update
  to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Le responsable peut retirer la ligne de quelqu'un (un inconnu a eu le lien, une erreur).
create policy "order_items: retirées par leur auteur ou le responsable"
  on public.order_items for delete
  to authenticated
  using (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.owner_id = (select auth.uid())
    )
  );

-- Même modèle que lock_open_session : chaque écriture de l'app prend un verrou partagé sur
-- la soirée ; mark_ordered (for update) attend qu'elles soient validées, et une écriture
-- arrivée après « Commande passée » relit l'étape et échoue.
create function public.lock_soiree_ordering(target_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.groups
  where id = target_group_id
    and kind = 'soiree'
    and soiree_step = 'commande'
    and public.is_group_member(id)
  for share;

  -- Message neutre : un non-membre est refusé ici aussi (les triggers BEFORE passent avant
  -- le WITH CHECK de la RLS), sans apprendre si la soirée existe.
  if not found then
    raise exception 'Commande fermée ou soirée introuvable'
      using errcode = '55000', hint = 'ordering_closed';
  end if;
end;
$$;

revoke execute on function public.lock_soiree_ordering(uuid) from public, anon;
grant execute on function public.lock_soiree_ordering(uuid) to authenticated;

-- security invoker : seules les écritures de l'app sont contrôlées ; les cascades (membre
-- retiré, soirée effacée) et les fonctions security definer passent.
create function public.lock_soiree_of_order_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    perform public.lock_soiree_ordering(coalesce(new.group_id, old.group_id));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger order_items_lock_soiree
  before insert or update or delete on public.order_items
  for each row execute function public.lock_soiree_of_order_item();

-- Temps réel : chacun voit les lignes des autres arriver. Avec la RLS, un DELETE ne
-- transporte que la clé primaire (pas group_id) : l'app écoute les suppressions sans filtre
-- et recharge, comme pour les plats (src/lib/votes.ts).
alter publication supabase_realtime add table public.order_items;

-- ─── anonymes : création et adhésion aux foyers bloquées ─
-- Mêmes corps qu'avant (migration group_functions), plus le refus des comptes anonymes.
create or replace function public.create_group(group_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_group public.groups;
begin
  if caller_id is null or public.is_anonymous_user() then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- Un code tiré peut déjà exister (très improbable) : on retente avec un autre.
  for attempt in 1..5 loop
    begin
      insert into public.groups (name, owner_id, invite_code)
      values (trim(group_name), caller_id, public.generate_invite_code())
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

  return new_group;
end;
$$;

-- Le code d'invitation fait entrer pour toujours (foyer) : jamais un compte anonyme.
create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_group_id uuid;
begin
  if caller_id is null or public.is_anonymous_user() then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- Saisie tolérante : « k7mx 4qp9 » vaut « K7MX4QP9 ».
  select id into target_group_id
  from public.groups
  where invite_code = upper(replace(code, ' ', ''));

  if target_group_id is null then
    raise exception 'Code d''invitation invalide' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, profile_id)
  values (target_group_id, caller_id)
  on conflict do nothing;

  return target_group_id;
end;
$$;

-- ─── lancer un vote ──────────────────────────────────────
-- Un anonyme propose et vote, il ne lance pas. Dans une soirée, le vote sert à choisir le
-- resto : seulement à l'étape « choix ».
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
      where g.id = group_id and (g.kind = 'foyer' or g.soiree_step = 'choix')
    )
  );

-- ─── create_soiree ───────────────────────────────────────
-- Jeton du lien : 16 octets aléatoires en base64 adapté aux URL (22 caractères).
create function public.generate_join_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/=', '-_');
$$;

revoke execute on function public.generate_join_token() from public, anon, authenticated;

create function public.create_soiree(soiree_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_group public.groups;
begin
  if caller_id is null or public.is_anonymous_user() then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  for attempt in 1..5 loop
    begin
      insert into public.groups (name, owner_id, invite_code, kind, soiree_step, join_token)
      values (
        trim(soiree_name), caller_id, public.generate_invite_code(),
        'soiree', 'choix', public.generate_join_token()
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

  return new_group;
end;
$$;

revoke execute on function public.create_soiree(text) from public, anon;
grant execute on function public.create_soiree(text) to authenticated;

-- ─── join_soiree ─────────────────────────────────────────
-- Seule porte d'entrée d'un compte anonyme. Un vrai compte garde son profil (nom et avatar
-- ignorés) ; un invité crée le sien. Rejoindre deux fois ne fait rien. Renvoie la soirée.
create function public.join_soiree(
  token text,
  guest_name text default null,
  guest_avatar text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  soiree public.groups;
begin
  if caller_id is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- for update : deux arrivées simultanées ne dépassent pas le plafond ensemble.
  select * into soiree
  from public.groups
  where kind = 'soiree' and join_token = token
  for update;

  if soiree.id is null then
    raise exception 'Lien de soirée invalide' using errcode = 'P0002', hint = 'invalid_link';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = soiree.id and profile_id = caller_id
  ) then
    return soiree.id;
  end if;

  if soiree.soiree_step = 'passee' then
    raise exception 'La commande est déjà passée' using errcode = '55000', hint = 'soiree_closed';
  end if;

  if (select count(*) from public.group_members where group_id = soiree.id) >= 20 then
    raise exception 'La soirée est complète' using errcode = '55000', hint = 'soiree_full';
  end if;

  if not exists (select 1 from public.profiles where id = caller_id) then
    if guest_name is null or length(trim(guest_name)) = 0 then
      raise exception 'Choisis un pseudo' using errcode = '22023', hint = 'name_required';
    end if;
    -- Les contraintes de profiles valident la longueur du nom et l'avatar.
    insert into public.profiles (id, display_name, avatar)
    values (caller_id, trim(guest_name), guest_avatar);
  end if;

  insert into public.group_members (group_id, profile_id)
  values (soiree.id, caller_id);

  return soiree.id;
end;
$$;

revoke execute on function public.join_soiree(text, text, text) from public, anon;
grant execute on function public.join_soiree(text, text, text) to authenticated;

-- ─── choose_restaurant ───────────────────────────────────
-- Le responsable fixe le resto sans vote (« Kebab samedi », décidé d'avance). Refusé si un
-- vote est en cours : c'est lui qui décidera.
create function public.choose_restaurant(target_group_id uuid, restaurant_name text)
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
  set restaurant = trim(restaurant_name), soiree_step = 'commande'
  where id = target_group_id
  returning * into soiree;

  return soiree;
end;
$$;

revoke execute on function public.choose_restaurant(uuid, text) from public, anon;
grant execute on function public.choose_restaurant(uuid, text) to authenticated;

-- ─── fin du vote « Où on mange ? » ───────────────────────
-- À la clôture d'un vote de soirée (étape « choix »), le plat gagnant devient le resto et la
-- commande s'ouvre. close_session n'est pas modifiée.
create function public.open_soiree_ordering()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.groups g
  set restaurant = p.name, soiree_step = 'commande'
  from public.proposals p
  where g.id = new.group_id
    and g.kind = 'soiree'
    and g.soiree_step = 'choix'
    and p.id = new.winner_proposal_id;
  return null;
end;
$$;

revoke execute on function public.open_soiree_ordering() from public, anon, authenticated;

create trigger vote_sessions_open_soiree_ordering
  after update of status on public.vote_sessions
  for each row
  when (old.status = 'open' and new.status = 'closed')
  execute function public.open_soiree_ordering();

-- ─── mark_ordered ────────────────────────────────────────
-- « Commande passée » : tout se fige (lignes, lien), début des 24 h d'historique.
-- for update attend les écritures en cours (verrou partagé de lock_soiree_ordering).
create function public.mark_ordered(target_group_id uuid)
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

  if soiree.soiree_step <> 'commande' then
    raise exception 'La commande n''est pas ouverte' using errcode = '55000', hint = 'step_mismatch';
  end if;

  update public.groups
  set soiree_step = 'passee', ordered_at = now()
  where id = target_group_id
  returning * into soiree;

  return soiree;
end;
$$;

revoke execute on function public.mark_ordered(uuid) from public, anon;
grant execute on function public.mark_ordered(uuid) to authenticated;

-- ─── purge ───────────────────────────────────────────────
-- Rien n'est gardé sans raison (RGPD) :
--   - soirée passée depuis 24 h (l'historique promis) ;
--   - soirée créée depuis 7 jours, quelle que soit son étape (abandonnée sans commande) ;
--   - compte anonyme qui n'est plus dans aucun groupe. Délai d'1 h : un invité vient de se
--     connecter et n'a pas encore rejoint sa soirée.
-- La cascade emporte membres, votes et lignes de commande. reference_time : pour les tests.
-- Renvoie le nombre de soirées effacées.
create function public.purge_soirees(reference_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_count integer;
begin
  delete from public.groups
  where kind = 'soiree'
    and (
      (soiree_step = 'passee' and ordered_at <= reference_time - interval '24 hours')
      or created_at <= reference_time - interval '7 days'
    );
  get diagnostics purged_count = row_count;

  delete from auth.users u
  where u.is_anonymous
    and u.created_at <= reference_time - interval '1 hour'
    and not exists (select 1 from public.group_members m where m.profile_id = u.id);

  return purged_count;
end;
$$;

revoke execute on function public.purge_soirees(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_soirees(timestamptz) to service_role;

-- Toutes les heures, à la 17e minute (à l'écart des autres tâches).
select cron.schedule(
  'purge-soirees',
  '17 * * * *',
  $$ select public.purge_soirees() $$
);
