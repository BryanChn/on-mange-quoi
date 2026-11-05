-- Droits par colonne : l'app n'écrit que les colonnes prévues (10 cas).
-- Transaction annulée à la fin : la base n'est pas modifiée.
-- Lancer (Supabase local démarré) :
--   docker exec -i supabase_db_on-mange-quoi psql -U postgres -tA < supabase/scripts/test-column-privileges.sql

\set QUIET on
\set ON_ERROR_STOP off
begin;
-- Bryan owner de Famille, sans profil au départ (il le crée comme l'app)
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

\echo '=== PROFILES'
\echo ' 1. Bryan crée son profil daté de 2000   (attendu : refus, permission)'
savepoint t; insert into public.profiles (id, display_name, created_at) values ('00000000-0000-0000-0000-00000000000a','Bryan','2000-01-01'); rollback to t;
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000a','Bryan') on conflict (id) do update set id = excluded.id, display_name = excluded.display_name;
select ' 2. Bryan crée son profil comme l''app (upsert) : ' || display_name || '   (attendu : Bryan)' from public.profiles;
with u as (update public.profiles set display_name = 'Bryan C.' returning 1) select ' 3. Bryan change son nom : ' || count(*) || '   (attendu : 1)' from u;

\echo '=== GROUPS'
select ' 4. Bryan crée Famille par la fonction : ' || (public.create_group('Famille')).name || '   (attendu : Famille)';
with u as (update public.groups set name = 'Foyer' returning 1) select ' 5. Bryan renomme son groupe : ' || count(*) || '   (attendu : 1)' from u;

\echo '=== VOTE_SESSIONS'
\echo ' 6. Bryan lance un vote daté de 2099   (attendu : refus, permission)'
savepoint t; insert into public.vote_sessions (group_id, organizer_id, created_at) select id, '00000000-0000-0000-0000-00000000000a', '2099-01-01' from public.groups; rollback to t;
insert into public.vote_sessions (group_id, organizer_id) select id, '00000000-0000-0000-0000-00000000000a' from public.groups;
select ' 7. Bryan lance un vote comme l''app : ' || status || ', daté d''aujourd''hui : ' || (created_at::date = current_date) || '   (attendu : open, true)' from public.vote_sessions;

\echo '=== PROPOSALS ET VOTES'
\echo ' 8. Bryan propose un plat en choisissant son id   (attendu : refus, permission)'
savepoint t; insert into public.proposals (id, session_id, name, proposed_by) select '22222222-0000-0000-0000-000000000001', id, 'Pizza', '00000000-0000-0000-0000-00000000000a' from public.vote_sessions; rollback to t;
insert into public.proposals (session_id, name, proposed_by) select id, 'Pizza', '00000000-0000-0000-0000-00000000000a' from public.vote_sessions;
\echo ' 9. Bryan vote daté de 2099   (attendu : refus, permission)'
savepoint t; insert into public.votes (proposal_id, profile_id, created_at) select id, '00000000-0000-0000-0000-00000000000a', '2099-01-01' from public.proposals; rollback to t;
insert into public.votes (proposal_id, profile_id) select id, '00000000-0000-0000-0000-00000000000a' from public.proposals;
select '10. Bryan propose et vote comme l''app : ' || count(*) || ' vote(s)   (attendu : 1)' from public.votes;
rollback;
