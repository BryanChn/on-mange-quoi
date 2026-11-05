-- Clôture du vote (MVP, points 4 à 6) : tout le monde voit la clôture en direct,
-- et plus rien ne bouge une fois le gagnant calculé.

-- ─── temps réel ──────────────────────────────────────────

-- La clôture (status, gagnant, decided_by) arrive en direct sur tous les téléphones,
-- pour que la roulette démarre partout en même temps. La RLS filtre toujours par abonné.
alter publication supabase_realtime add table public.vote_sessions;

-- ─── plats et votes figés à la clôture ───────────────────

-- Course corrigée (reproduite le 2026-11-05) : un vote validé par la RLS pendant que
-- close_session compte n'était pas compté, mais restait enregistré. Résultat : Curry 2,
-- Pizza 1, et « Pizza choisie par l'organisateur », alors qu'on ne peut pas imposer un plat.
--
-- Chaque écriture de l'app prend un verrou partagé (for share) sur la session :
--   - plusieurs votes simultanés ne se bloquent pas entre eux ;
--   - close_session (for update) attend qu'ils soient validés, puis les compte ;
--   - une écriture arrivée après la clôture attend, relit la session (fermée) et échoue.
-- Membre du groupe exigé : la fonction ne renseigne pas un inconnu sur une session.
create function public.lock_open_session(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.vote_sessions
  where id = target_session_id
    and status = 'open'
    and public.is_group_member(group_id)
  for share;

  if not found then
    -- hint : clé stable que l'app reconnaît pour afficher « Le vote est clos ».
    raise exception 'Session clôturée ou introuvable'
      using errcode = '55000', hint = 'session_closed';
  end if;
end;
$$;

revoke execute on function public.lock_open_session(uuid) from public, anon;
grant execute on function public.lock_open_session(uuid) to authenticated;

-- security invoker (par défaut) : current_user est le rôle qui écrit.
-- Seules les écritures de l'app (authenticated) sont contrôlées. Les fonctions
-- security definer et les cascades (suppression d'un compte ou d'un groupe) passent :
-- elles suppriment aussi des votes de sessions fermées, et doivent pouvoir le faire.
create function public.lock_session_of_proposal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    perform public.lock_open_session(coalesce(new.session_id, old.session_id));
  end if;
  return coalesce(new, old);
end;
$$;

create function public.lock_session_of_vote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    perform public.lock_open_session((
      select session_id from public.proposals
      where id = coalesce(new.proposal_id, old.proposal_id)
    ));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger proposals_lock_open_session
  before insert or delete on public.proposals
  for each row execute function public.lock_session_of_proposal();

create trigger votes_lock_open_session
  before insert or delete on public.votes
  for each row execute function public.lock_session_of_vote();
