-- Scénarios de la mesure du feu vert : private.feu_vert (7 cas).
-- Transaction annulée à la fin : la base n'est pas modifiée.
-- Lancer (Supabase local démarré) :
--   docker exec -i supabase_db_on-mange-quoi psql -U postgres -tA < supabase/scripts/test-feu-vert.sql

\set QUIET on
\set ON_ERROR_STOP off
begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000a','Bryan');
insert into public.groups (id, name, owner_id, invite_code) values
  ('99999999-0000-0000-0000-000000000001','Famille','00000000-0000-0000-0000-00000000000a','FAM11111'),
  ('99999999-0000-0000-0000-000000000002','Autre','00000000-0000-0000-0000-00000000000a','AUT22222');
insert into public.group_members (group_id, profile_id) values
  ('99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a'),
  ('99999999-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a');

-- Une session clôturée à chaque instant (UTC), comme le ferait close_session
do $$
declare
  c record;
  v_session uuid;
  v_proposal uuid;
begin
  for c in select * from (values
    -- Semaine du lundi 2 novembre, date de départ = mardi 3
    ('99999999-0000-0000-0000-000000000001'::uuid, '2026-11-02 19:00+00'::timestamptz), -- avant le départ : ignoré
    ('99999999-0000-0000-0000-000000000001', '2026-11-03 18:00+00'),
    ('99999999-0000-0000-0000-000000000001', '2026-11-03 20:00+00'), -- même soir : un seul soir
    ('99999999-0000-0000-0000-000000000001', '2026-11-04 19:00+00'),
    ('99999999-0000-0000-0000-000000000001', '2026-11-05 19:00+00'),
    ('99999999-0000-0000-0000-000000000001', '2026-11-06 19:00+00'),
    ('99999999-0000-0000-0000-000000000002', '2026-11-07 19:00+00'), -- autre groupe : ignoré
    -- Dimanche 8 à 23 h 30 UTC = lundi 9 à 0 h 30 à Paris : semaine suivante
    ('99999999-0000-0000-0000-000000000001', '2026-11-08 23:30+00'),
    ('99999999-0000-0000-0000-000000000001', '2026-11-10 19:00+00')
  ) as t(group_id, closed_at)
  loop
    insert into public.vote_sessions (group_id, organizer_id)
      values (c.group_id, '00000000-0000-0000-0000-00000000000a') returning id into v_session;
    insert into public.proposals (session_id, name) values (v_session, 'Pizza') returning id into v_proposal;
    update public.vote_sessions
      set status = 'closed', winner_proposal_id = v_proposal, decided_by = 'vote', closed_at = c.closed_at
      where id = v_session;
  end loop;
end $$;
-- Une session encore ouverte : ignorée
insert into public.vote_sessions (group_id, organizer_id)
  values ('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a');

create temp table resultat on commit drop as
  select * from private.feu_vert('99999999-0000-0000-0000-000000000001', '2026-11-03');

\echo '=== private.feu_vert'
select ' 1. Première semaine affichée : ' || min(semaine) || '   (attendu : 2026-11-02, le lundi de la date de départ)' from resultat;
select ' 2. Semaine du 2 : ' || soirs || ' soirs, réussie ' || reussie || '   (attendu : 4, true ; le 2 avant le départ, le 3 compté une fois, l''autre groupe ignoré)' from resultat where semaine = '2026-11-02';
select ' 3. Semaine du 9 : ' || soirs || ' soirs, réussie ' || reussie || '   (attendu : 2, false ; le dimanche 23 h 30 UTC compte le lundi à Paris)' from resultat where semaine = '2026-11-09';
select ' 4. Semaine du 16 : ' || soirs || ' soirs, réussie ' || reussie || '   (attendu : 0, false ; semaine vide affichée)' from resultat where semaine = '2026-11-16';
select ' 5. Semaines sans trou : ' || (count(*) = (max(semaine) - min(semaine)) / 7 + 1) || '   (attendu : true)' from resultat;
select ' 6. Groupe sans vote : ' || coalesce(sum(soirs), 0) || ' soir   (attendu : 0)' from private.feu_vert('99999999-0000-0000-0000-000000000099', '2026-11-03');

\echo ' 7. Un téléphone (authenticated) appelle la fonction   (attendu : refus, permission denied)'
set local role authenticated;
savepoint t; select private.feu_vert('99999999-0000-0000-0000-000000000001', '2026-11-03'); rollback to t;
reset role;

rollback;
