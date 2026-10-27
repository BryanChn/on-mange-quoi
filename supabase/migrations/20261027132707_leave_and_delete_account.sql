-- Quitter un groupe et supprimer son compte (règles de docs/schema.md) :
-- l'owner qui part transmet le groupe (au membre choisi, sinon au plus ancien) ;
-- seul, il emporte le groupe. La suppression de compte = quitter tous ses groupes,
-- puis supprimer le compte. La confirmation (« ce groupe sera supprimé ») est côté app.

-- ─── leave_group ─────────────────────────────────────────

create function public.leave_group(target_group_id uuid, new_owner_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_group public.groups;
  successor_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- for update : deux départs simultanés ne peuvent pas désigner deux owners.
  select * into target_group
  from public.groups
  where id = target_group_id
  for update;

  if target_group.id is null or not exists (
    select 1 from public.group_members
    where group_id = target_group_id and profile_id = caller_id
  ) then
    raise exception 'Groupe introuvable ou vous n''en êtes pas membre' using errcode = 'P0002';
  end if;

  if target_group.owner_id = caller_id then
    if new_owner_id is not null then
      if new_owner_id = caller_id or not exists (
        select 1 from public.group_members
        where group_id = target_group_id and profile_id = new_owner_id
      ) then
        raise exception 'Le nouvel owner doit être un autre membre du groupe'
          using errcode = '22023';
      end if;
      successor_id := new_owner_id;
    else
      select profile_id into successor_id
      from public.group_members
      where group_id = target_group_id and profile_id <> caller_id
      order by joined_at, profile_id
      limit 1;
    end if;

    -- Seul dans le groupe : le groupe part avec lui (cascade : membres, sessions, votes).
    if successor_id is null then
      delete from public.groups where id = target_group_id;
      return;
    end if;

    update public.groups set owner_id = successor_id where id = target_group_id;
  end if;

  delete from public.group_members
  where group_id = target_group_id and profile_id = caller_id;
end;
$$;

revoke execute on function public.leave_group(uuid, uuid) from public, anon;
grant execute on function public.leave_group(uuid, uuid) to authenticated;

-- ─── delete_account ──────────────────────────────────────

-- Supprime le compte de l'utilisateur connecté (exigence Apple), dans une transaction.
-- Les jetons de connexion déjà émis restent valides jusqu'à leur expiration :
-- l'app doit déconnecter l'utilisateur juste après l'appel.
create function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  membership record;
begin
  if caller_id is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- 1. Quitter chaque groupe (transferts d'ownership, ou suppression si seul).
  for membership in
    select group_id from public.group_members where profile_id = caller_id
  loop
    perform public.leave_group(membership.group_id);
  end loop;

  -- 2. Ses plats sans vote dans les votes en cours disparaissent ; les autres restent
  --    (proposed_by passe à null). Jamais dans une session fermée : le gagnant d'un
  --    tirage peut n'avoir aucun vote.
  delete from public.proposals p
  using public.vote_sessions s
  where p.session_id = s.id
    and s.status = 'open'
    and p.proposed_by = caller_id
    and not public.proposal_has_votes(p.id);

  -- 3. Le compte. Cascade : profil, votes. Set null : sessions organisées, plats proposés.
  delete from auth.users where id = caller_id;
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
