-- Soirées, écrans (V1, PR 3) : ce dont l'app a besoin en plus de la migration soirees.

-- ─── badge « invité » ────────────────────────────────────
-- Vrai pour un profil créé par join_soiree depuis un compte anonyme (pseudo, sans email).
-- Les membres le voient à côté du nom (« Tom · invité »). Écrit seulement par le serveur :
-- aucun droit d'écriture pour l'app (droits par colonne).
alter table public.profiles add column is_guest boolean not null default false;

-- Même corps que dans la migration soirees, plus is_guest à la création du profil.
create or replace function public.join_soiree(
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
    insert into public.profiles (id, display_name, avatar, is_guest)
    values (caller_id, trim(guest_name), guest_avatar, public.is_anonymous_user());
  end if;

  insert into public.group_members (group_id, profile_id)
  values (soiree.id, caller_id);

  return soiree.id;
end;
$$;

-- ─── aperçu avant de rejoindre ───────────────────────────
-- La page du lien montre « Bryan t'invite à Samedi chez Bryan » et qui vient, AVANT que le
-- visiteur ne rejoigne (il n'est pas membre : la RLS lui cache tout) et même avant qu'il ait
-- un compte (rôle anon). Le jeton est le secret : qui l'a peut voir le minimum suivant.
-- Rien d'autre : ni le code d'invitation, ni les lignes de commande, ni les votes.
-- Aucune ligne si le lien ne correspond à aucune soirée.
create function public.soiree_preview(token text)
returns table (
  id uuid,
  name text,
  owner_name text,
  step public.soiree_step,
  member_count integer,
  -- Les 5 premiers arrivés : [{ "name": "Bryan", "avatar": "chat" }, …]
  members jsonb,
  -- Le compte connecté est-il déjà dans la soirée ? (faux sans compte)
  is_member boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.name::text,
    owner.display_name::text,
    g.soiree_step,
    (select count(*)::integer from public.group_members m where m.group_id = g.id),
    coalesce((
      select jsonb_agg(jsonb_build_object('name', p.display_name, 'avatar', p.avatar)
        order by m.joined_at)
      from (
        select profile_id, joined_at from public.group_members
        where group_id = g.id order by joined_at limit 5
      ) m
      join public.profiles p on p.id = m.profile_id
    ), '[]'::jsonb),
    exists (
      select 1 from public.group_members m
      where m.group_id = g.id and m.profile_id = (select auth.uid())
    )
  from public.groups g
  join public.profiles owner on owner.id = g.owner_id
  where g.kind = 'soiree' and g.join_token = token;
$$;

revoke execute on function public.soiree_preview(text) from public;
grant execute on function public.soiree_preview(text) to anon, authenticated;

-- ─── temps réel ──────────────────────────────────────────
-- L'écran de la soirée suit qui arrive ou part (group_members) et le changement d'étape
-- (groups). Chaque abonné ne reçoit que les lignes que la RLS lui laisse lire.
alter publication supabase_realtime add table public.group_members, public.groups;
