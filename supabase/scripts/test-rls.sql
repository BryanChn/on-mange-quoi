-- Scénarios RLS : 3 utilisateurs (Bryan owner, Maman membre, Tonton étranger), 20 cas.
-- Tout se passe dans une transaction annulée à la fin : la base n'est pas modifiée.
-- Lancer (Supabase local démarré) :
--   docker exec -i supabase_db_on-mange-quoi psql -U postgres -tA < supabase/scripts/test-rls.sql
-- Chaque ligne affiche le résultat obtenu et le résultat attendu.
-- À terme : migrer vers pgTAP (supabase test db) pour un vrai pass/fail automatique.

\set QUIET on
\set ON_ERROR_STOP off
begin;
-- ── Données (admin) : Bryan owner de Famille, Maman membre, Tonton dans Travail
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000a','Bryan'),('00000000-0000-0000-0000-00000000000b','Maman'),('00000000-0000-0000-0000-00000000000c','Tonton');
insert into public.groups (id, name, owner_id, invite_code) values
  ('99999999-0000-0000-0000-000000000001','Famille','00000000-0000-0000-0000-00000000000a','FAM111'),
  ('99999999-0000-0000-0000-000000000002','Travail','00000000-0000-0000-0000-00000000000c','TRA222');
insert into public.group_members (group_id, profile_id) values
  ('99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a'),
  ('99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b'),
  ('99999999-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000c');
insert into public.vote_sessions (id, group_id, organizer_id) values ('11111111-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b');
insert into public.proposals (id, session_id, name, proposed_by) values
  ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Pizza','00000000-0000-0000-0000-00000000000b'),
  ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','Curry','00000000-0000-0000-0000-00000000000a');
insert into public.votes values ('22222222-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b');

set local role authenticated;
\echo '=== PROFILES'
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select ' 1. Bryan voit : ' || string_agg(display_name, ', ' order by display_name) || '   (attendu : Bryan, Maman)' from public.profiles;
with u as (update public.profiles set display_name = 'X' where display_name = 'Maman' returning 1) select ' 2. Bryan renomme Maman : ' || count(*) || ' ligne   (attendu : 0)' from u;
\echo ' 3. Bryan crée un profil pour un autre id   (attendu : refus RLS)'
savepoint t; insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000c','Faux'); rollback to t;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select ' 4. Tonton voit : ' || string_agg(display_name, ', ') || '   (attendu : Tonton)' from public.profiles;

\echo '=== PROPOSALS (session ouverte de Famille)'
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.proposals (session_id, name, proposed_by) values ('11111111-0000-0000-0000-000000000001','Tacos','00000000-0000-0000-0000-00000000000a');
\echo ' 5. Bryan propose Tacos   (attendu : OK)'
\echo ' 6. Bryan propose au nom de Maman   (attendu : refus RLS)'
savepoint t; insert into public.proposals (session_id, name, proposed_by) values ('11111111-0000-0000-0000-000000000001','Soupe','00000000-0000-0000-0000-00000000000b'); rollback to t;
with d as (delete from public.proposals where name = 'Pizza' returning 1) select ' 7. Bryan retire Pizza (pas à lui) : ' || count(*) || '   (attendu : 0)' from d;
with d as (delete from public.proposals where name = 'Curry' returning 1) select ' 8. Bryan retire Curry (à lui, 0 vote) : ' || count(*) || '   (attendu : 1)' from d;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
with d as (delete from public.proposals where name = 'Pizza' returning 1) select ' 9. Maman retire Pizza (à elle, 1 vote) : ' || count(*) || '   (attendu : 0)' from d;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
\echo '10. Tonton propose dans Famille   (attendu : refus RLS)'
savepoint t; insert into public.proposals (session_id, name, proposed_by) values ('11111111-0000-0000-0000-000000000001','Kebab','00000000-0000-0000-0000-00000000000c'); rollback to t;
select '11. Tonton voit ' || count(*) || ' proposition(s)   (attendu : 0)' from public.proposals;

\echo '=== VOTES'
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.votes values ('22222222-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a');
\echo '12. Bryan coche Pizza   (attendu : OK)'
\echo '13. Bryan recoche Pizza   (attendu : refus doublon)'
savepoint t; insert into public.votes values ('22222222-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a'); rollback to t;
\echo '14. Bryan vote au nom de Maman pour Tacos   (attendu : refus RLS)'
savepoint t; insert into public.votes select id, '00000000-0000-0000-0000-00000000000b' from public.proposals where name = 'Tacos'; rollback to t;
select '15. Bryan voit ' || count(*) || ' votes   (attendu : 2)' from public.votes;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
with d as (delete from public.votes where profile_id = '00000000-0000-0000-0000-00000000000a' returning 1) select '16. Maman décoche le vote de Bryan : ' || count(*) || '   (attendu : 0)' from d;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select '17. Tonton voit ' || count(*) || ' votes   (attendu : 0)' from public.votes;

\echo '=== SESSION FERMÉE (clôture simulée en admin)'
reset role;
update public.vote_sessions set status = 'closed', closed_at = now(), decided_by = 'vote', winner_proposal_id = '22222222-0000-0000-0000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
\echo '18. Bryan propose après clôture   (attendu : refus RLS)'
savepoint t; insert into public.proposals (session_id, name, proposed_by) values ('11111111-0000-0000-0000-000000000001','Sushi','00000000-0000-0000-0000-00000000000a'); rollback to t;
\echo '19. Bryan vote Tacos après clôture   (attendu : refus RLS)'
savepoint t; insert into public.votes select id, '00000000-0000-0000-0000-00000000000a' from public.proposals where name = 'Tacos'; rollback to t;
with d as (delete from public.votes where profile_id = '00000000-0000-0000-0000-00000000000a' returning 1) select '20. Bryan décoche après clôture : ' || count(*) || '   (attendu : 0)' from d;
rollback;
