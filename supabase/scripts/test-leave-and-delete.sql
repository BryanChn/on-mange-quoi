-- Scénarios de départ et de suppression de compte : leave_group, delete_account (11 cas).
-- Transaction annulée à la fin : la base n'est pas modifiée.
-- Lancer (Supabase local démarré) :
--   docker exec -i supabase_db_on-mange-quoi psql -U postgres -tA < supabase/scripts/test-leave-and-delete.sql

\set QUIET on
\set ON_ERROR_STOP off
begin;
-- Bryan owner de Famille (Maman arrivée avant Tonton) et seul dans Solo ; Intrus ailleurs
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c'),('00000000-0000-0000-0000-00000000000d');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000a','Bryan'),('00000000-0000-0000-0000-00000000000b','Maman'),('00000000-0000-0000-0000-00000000000c','Tonton'),('00000000-0000-0000-0000-00000000000d','Intrus');
insert into public.groups (id, name, owner_id, invite_code) values
  ('99999999-0000-0000-0000-000000000001','Famille','00000000-0000-0000-0000-00000000000a','FAM11111'),
  ('99999999-0000-0000-0000-000000000002','Solo','00000000-0000-0000-0000-00000000000a','SOL22222');
insert into public.group_members (group_id, profile_id, joined_at) values
  ('99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a', now() - interval '3 days'),
  ('99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b', now() - interval '2 days'),
  ('99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c', now() - interval '1 day'),
  ('99999999-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a', now());
set local role authenticated;

\echo '=== leave_group'
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';
\echo ' 1. Intrus quitte Famille (pas membre)   (attendu : refus)'
savepoint t; select public.leave_group('99999999-0000-0000-0000-000000000001'); rollback to t;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
\echo ' 2. Bryan cède Famille à Intrus (pas membre)   (attendu : refus)'
savepoint t; select public.leave_group('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d'); rollback to t;
savepoint t;
select public.leave_group('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c') \g /dev/null
reset role;
select ' 3. Bryan cède à Tonton -> owner : ' || p.display_name || ', Bryan encore membre : ' || exists(select 1 from public.group_members where profile_id = '00000000-0000-0000-0000-00000000000a' and group_id = g.id) || '   (attendu : Tonton, false)' from public.groups g join public.profiles p on p.id = g.owner_id where g.name = 'Famille';
set local role authenticated;
rollback to t;
savepoint t;
select public.leave_group('99999999-0000-0000-0000-000000000001') \g /dev/null
reset role;
select ' 4. Bryan part sans choisir -> owner : ' || p.display_name || '   (attendu : Maman, la plus ancienne)' from public.groups g join public.profiles p on p.id = g.owner_id where g.name = 'Famille';
set local role authenticated;
rollback to t;
savepoint t;
select public.leave_group('99999999-0000-0000-0000-000000000002') \g /dev/null
reset role;
select ' 5. Bryan quitte Solo (seul) -> groupe existe encore : ' || exists(select 1 from public.groups where name = 'Solo') || '   (attendu : false)';
set local role authenticated;
rollback to t;

\echo '=== organisateur parti'
reset role;
insert into public.vote_sessions (id, group_id, organizer_id) values ('11111111-0000-0000-0000-000000000009','99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c');
insert into public.proposals (session_id, name) values ('11111111-0000-0000-0000-000000000009','Pizza');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select public.leave_group('99999999-0000-0000-0000-000000000001') \g /dev/null
\echo ' 6. Tonton (parti) clôture sa session   (attendu : refus)'
savepoint t; select public.close_session('11111111-0000-0000-0000-000000000009'); rollback to t;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select ' 7. Bryan (owner) la clôture -> ' || status || '   (attendu : closed)' from public.close_session('11111111-0000-0000-0000-000000000009');

\echo '=== delete_account de Bryan'
reset role;
-- Session fermée gagnée au tirage par Tacos (de Bryan, 0 vote) ; session ouverte : Curry (Bryan, 0 vote), Kebab (Bryan, 1 vote de Maman)
insert into public.vote_sessions (id, group_id, organizer_id) values ('11111111-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a');
insert into public.proposals (id, session_id, name, proposed_by) values ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Tacos','00000000-0000-0000-0000-00000000000a');
update public.vote_sessions set status = 'closed', closed_at = now(), decided_by = 'tirage', winner_proposal_id = '22222222-0000-0000-0000-000000000001' where id = '11111111-0000-0000-0000-000000000001';
insert into public.vote_sessions (id, group_id, organizer_id) values ('11111111-0000-0000-0000-000000000002','99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a');
insert into public.proposals (id, session_id, name, proposed_by) values
  ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000002','Curry','00000000-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000002','Kebab','00000000-0000-0000-0000-00000000000a');
insert into public.votes values ('22222222-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000b');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.delete_account() \g /dev/null
reset role;
select ' 8. Compte Bryan existe : ' || exists(select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a') || ', profil : ' || exists(select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000000a') || '   (attendu : false, false)';
select ' 9. Owner de Famille : ' || p.display_name || ', Solo existe : ' || exists(select 1 from public.groups where name = 'Solo') || '   (attendu : Maman, false)' from public.groups g join public.profiles p on p.id = g.owner_id where g.name = 'Famille';
select '10. Plats restants : ' || string_agg(name || coalesce(' (par ' || proposed_by::text || ')', ' (auteur effacé)'), ', ' order by name) || '   (attendu : Kebab et Tacos, auteur effacé ; Curry supprimé)' from public.proposals where name in ('Tacos','Curry','Kebab');
select '11. Session ouverte : organisateur ' || coalesce(organizer_id::text, 'null') || ', toujours ' || status || '   (attendu : null, open)' from public.vote_sessions where id = '11111111-0000-0000-0000-000000000002';
rollback;
