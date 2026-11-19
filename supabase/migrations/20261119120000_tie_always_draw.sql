-- Égalité : toujours départagée par tirage au sort, plus jamais par l'organisateur.
-- Retour d'usage du 2026-11-19 : choisir soi-même parmi les ex æquo était vécu comme un
-- passage en force, contraire à une décision collective. Désormais :
--   - gagnant unique → 'vote' (inchangé) ;
--   - égalité (dont « aucun vote ») → tirage parmi les ex æquo, sans rien demander ;
--   - method = 'organisateur' → refusé, même envoyé à la main.
-- Même signature qu'avant : les APK qui envoient encore method / chosen_proposal_id
-- continuent d'appeler la fonction sans erreur de résolution.
-- La valeur 'organisateur' reste dans l'enum decision_method pour les sessions passées.
create or replace function public.close_session(
  target_session_id  uuid,
  method             public.decision_method default null,
  chosen_proposal_id uuid default null
)
returns public.vote_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  session public.vote_sessions;
  leading_ids uuid[];
  winner_id uuid;
  decision public.decision_method;
begin
  if caller_id is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  if method = 'organisateur' then
    raise exception 'Le choix manuel n''existe plus : une égalité est départagée au tirage'
      using errcode = '22023';
  end if;

  -- for update : verrouille la session ; une clôture simultanée attend puis voit 'closed'.
  select * into session
  from public.vote_sessions
  where id = target_session_id
  for update;

  if session.id is null then
    raise exception 'Session introuvable' using errcode = 'P0002';
  end if;

  if session.status <> 'open' then
    raise exception 'Session déjà clôturée' using errcode = '55000';
  end if;

  -- Un organisateur qui a quitté le groupe ne peut plus clôturer ; l'owner, si.
  if not (
       (session.organizer_id = caller_id and exists (
          select 1 from public.group_members
          where group_id = session.group_id and profile_id = caller_id))
       or exists (
          select 1 from public.groups
          where id = session.group_id and owner_id = caller_id)
     ) then
    raise exception 'Seul l''organisateur ou l''owner du groupe peut clôturer'
      using errcode = '42501';
  end if;

  -- Plats en tête (même calcul que get_session_result, sans dépendre de la RLS).
  with scores as (
    select p.id, count(v.profile_id) as vote_count
    from public.proposals p
    left join public.votes v on v.proposal_id = p.id
    where p.session_id = target_session_id
    group by p.id
  )
  select array_agg(id) into leading_ids
  from scores
  where vote_count = (select max(vote_count) from scores);

  if leading_ids is null then
    raise exception 'Impossible de clôturer une session sans plat' using errcode = '22023';
  end if;

  if cardinality(leading_ids) = 1 then
    winner_id := leading_ids[1];
    decision := 'vote';
  else
    -- Tiré une seule fois, ici, et enregistré : la roulette des téléphones s'arrête dessus.
    winner_id := leading_ids[1 + floor(random() * cardinality(leading_ids))::int];
    decision := 'tirage';
  end if;

  update public.vote_sessions
  set status = 'closed',
      winner_proposal_id = winner_id,
      decided_by = decision,
      closed_at = now()
  where id = target_session_id
  returning * into session;

  return session;
end;
$$;

revoke execute on function public.close_session(uuid, public.decision_method, uuid) from public, anon;
grant execute on function public.close_session(uuid, public.decision_method, uuid) to authenticated;
