-- Scénarios de la logique de vote : get_session_result et close_session (11 cas).
-- Transaction annulée à la fin : la base n'est pas modifiée.
-- Lancer (Supabase local démarré) :
--   docker exec -i supabase_db_on-mange-quoi psql -U postgres -tA < supabase/scripts/test-vote-functions.sql

\set QUIET on
\set ON_ERROR_STOP off
begin;
-- Bryan owner de Famille ; Maman et Tonton membres ; Intrus hors groupe
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000a','Bryan'),('00000000-0000-0000-0000-00000000000b','Maman'),('00000000-0000-0000-0000-00000000000c','Tonton'),('00000000-0000-0000-0000-00000000000d','Intrus');
insert into public.groups (id, name, owner_id, invite_code) values ('99999999-0000-0000-0000-000000000001','Famille','00000000-0000-0000-0000-00000000000a','FAM11111');
insert into public.group_members (group_id, profile_id) values ('99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a'),('99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b'),('99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c');

-- Session 1 (Maman) : Pizza 2 votes, Curry 1
insert into public.vote_sessions (id, group_id, organizer_id) values ('11111111-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b');
insert into public.proposals (id, session_id, name) values ('22222222-0000-0000-0000-000000000011','11111111-0000-0000-0000-000000000001','Pizza'),('22222222-0000-0000-0000-000000000012','11111111-0000-0000-0000-000000000001','Curry');
insert into public.votes values ('22222222-0000-0000-0000-000000000011','00000000-0000-0000-0000-00000000000a'),('22222222-0000-0000-0000-000000000011','00000000-0000-0000-0000-00000000000b'),('22222222-0000-0000-0000-000000000012','00000000-0000-0000-0000-00000000000c');
set local role authenticated;

\echo '=== Session 1 : Pizza 2 / Curry 1'
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select ' 1. Tonton voit le score : ' || string_agg(name || '=' || vote_count || case when is_leading then '*' else '' end, ', ') from public.get_session_result('11111111-0000-0000-0000-000000000001');
\echo ' 2. Tonton (ni organisateur ni owner) clôture   (attendu : refus)'
savepoint t; select public.close_session('11111111-0000-0000-0000-000000000001'); rollback to t;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';
select ' 3. Intrus voit ' || count(*) || ' ligne(s) de score   (attendu : 0)' from public.get_session_result('11111111-0000-0000-0000-000000000001');
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select ' 4. Maman clôture en voulant imposer Curry -> gagnant : ' || p.name || ' par ' || s.decided_by || '   (attendu : Pizza par vote)'
  from public.close_session('11111111-0000-0000-0000-000000000001', 'organisateur', '22222222-0000-0000-0000-000000000012') s join public.proposals p on p.id = s.winner_proposal_id;
\echo ' 5. Maman reclôture   (attendu : refus, déjà clôturée)'
savepoint t; select public.close_session('11111111-0000-0000-0000-000000000001'); rollback to t;

\echo '=== Session 2 (Maman) : Pizza 1 / Curry 1 / Tacos 0'
reset role;
insert into public.vote_sessions (id, group_id, organizer_id) values ('11111111-0000-0000-0000-000000000002','99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b');
insert into public.proposals (id, session_id, name) values ('22222222-0000-0000-0000-000000000021','11111111-0000-0000-0000-000000000002','Pizza'),('22222222-0000-0000-0000-000000000022','11111111-0000-0000-0000-000000000002','Curry'),('22222222-0000-0000-0000-000000000023','11111111-0000-0000-0000-000000000002','Tacos');
insert into public.votes values ('22222222-0000-0000-0000-000000000021','00000000-0000-0000-0000-00000000000a'),('22222222-0000-0000-0000-000000000022','00000000-0000-0000-0000-00000000000b');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
\echo ' 6. Clôture sans méthode   (attendu : refus, hint tie_needs_choice)'
\set VERBOSITY verbose
savepoint t; select public.close_session('11111111-0000-0000-0000-000000000002'); rollback to t;
\set VERBOSITY default
\echo ' 7. Choix manuel de Tacos (pas ex æquo)   (attendu : refus)'
savepoint t; select public.close_session('11111111-0000-0000-0000-000000000002', 'organisateur', '22222222-0000-0000-0000-000000000023'); rollback to t;
select ' 8. Choix manuel de Curry -> ' || p.name || ' par ' || s.decided_by || '   (attendu : Curry par organisateur)'
  from public.close_session('11111111-0000-0000-0000-000000000002', 'organisateur', '22222222-0000-0000-0000-000000000022') s join public.proposals p on p.id = s.winner_proposal_id;

\echo '=== Session 3 (Maman, oubliée) : aucun vote, 3 plats -> Bryan (owner) clôture par tirage'
reset role;
insert into public.vote_sessions (id, group_id, organizer_id) values ('11111111-0000-0000-0000-000000000003','99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b');
insert into public.proposals (id, session_id, name) values ('22222222-0000-0000-0000-000000000031','11111111-0000-0000-0000-000000000003','Pizza'),('22222222-0000-0000-0000-000000000032','11111111-0000-0000-0000-000000000003','Curry'),('22222222-0000-0000-0000-000000000033','11111111-0000-0000-0000-000000000003','Tacos');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select ' 9. Tirage -> ' || p.name || ' par ' || s.decided_by || '   (attendu : un des 3, par tirage)'
  from public.close_session('11111111-0000-0000-0000-000000000003', 'tirage') s join public.proposals p on p.id = s.winner_proposal_id;

\echo '=== Session 4 : sans plat'
reset role;
insert into public.vote_sessions (id, group_id, organizer_id) values ('11111111-0000-0000-0000-000000000004','99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a');
set local role authenticated;
\echo '10. Clôture   (attendu : refus, sans plat)'
savepoint t; select public.close_session('11111111-0000-0000-0000-000000000004', 'tirage'); rollback to t;
rollback;

\echo '=== Équité du tirage : 3 000 tirages entre 3 ex æquo (admin)'
select '11. Répartition : ' || string_agg(n::text, ' / ') || '   (attendu : ~1000 chacun)' from (
  select count(*) n from (select 1 + floor(random() * 3)::int i from generate_series(1, 3000)) t group by i order by i) s;
