-- Logique de décision du vote, côté serveur (règles du vote, CLAUDE.md) :
-- le plat le plus voté gagne ; en cas d'égalité (aucun vote inclus), celui qui clôture
-- choisit le tirage ou un plat parmi les ex æquo. Le tirage est fait ici, une seule fois,
-- pour que tous les téléphones affichent le même résultat et que personne ne le relance.

-- ─── get_session_result ──────────────────────────────────

-- Score de chaque plat et indicateur « en tête ». Plusieurs lignes en tête = égalité.
-- Ne modifie rien. security invoker (par défaut) : la RLS s'applique, seuls les
-- membres du groupe obtiennent des lignes.
create function public.get_session_result(target_session_id uuid)
returns table (proposal_id uuid, name varchar, vote_count bigint, is_leading boolean)
language sql
stable
set search_path = ''
as $$
  with scores as (
    select p.id, p.name, count(v.profile_id) as vote_count
    from public.proposals p
    left join public.votes v on v.proposal_id = p.id
    where p.session_id = target_session_id
    group by p.id, p.name
  )
  select id, name, vote_count, vote_count = max(vote_count) over () as is_leading
  from scores
  order by vote_count desc, name;
$$;

revoke execute on function public.get_session_result(uuid) from public, anon;
grant execute on function public.get_session_result(uuid) to authenticated;

-- ─── close_session ───────────────────────────────────────

-- Clôture la session et enregistre le gagnant.
--   - Gagnant unique : il l'emporte (decided_by = 'vote'), method et chosen sont ignorés :
--     personne ne peut imposer un plat.
--   - Égalité : method obligatoire. 'tirage' → tiré au hasard parmi les ex æquo ;
--     'organisateur' → chosen_proposal_id doit être l'un des ex æquo.
-- Réservé à l'organisateur, ou à l'owner du groupe (session oubliée).
create function public.close_session(
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

  if session.organizer_id is distinct from caller_id
     and not exists (
       select 1 from public.groups
       where id = session.group_id and owner_id = caller_id
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
  elsif method = 'tirage' then
    winner_id := leading_ids[1 + floor(random() * cardinality(leading_ids))::int];
    decision := 'tirage';
  elsif method = 'organisateur' then
    if chosen_proposal_id is null or not (chosen_proposal_id = any (leading_ids)) then
      raise exception 'Le plat choisi doit faire partie des ex æquo' using errcode = '22023';
    end if;
    winner_id := chosen_proposal_id;
    decision := 'organisateur';
  else
    -- hint : clé stable que l'app reconnaît pour afficher « Roulette / Je choisis ».
    raise exception 'Égalité : choisir le tirage ou un plat parmi les ex æquo'
      using errcode = '22023', hint = 'tie_needs_choice';
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
