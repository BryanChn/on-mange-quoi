-- Jetons push : enregistrement, RLS, téléphone partagé, cascade (11 cas).
-- Transaction annulée à la fin : la base n'est pas modifiée.
-- Lancer (Supabase local démarré) :
--   docker exec -i supabase_db_on-mange-quoi psql -U postgres -tA < supabase/scripts/test-push-tokens.sql

\set QUIET on
\set ON_ERROR_STOP off
begin;
-- Bryan (a) et sa compagne (b), avec leur profil
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Bryan'),
  ('00000000-0000-0000-0000-00000000000b', 'Compagne');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

\echo '=== BRYAN ENREGISTRE SON TÉLÉPHONE'
select public.register_push_token('ExponentPushToken[telephoneBryan]');
select ' 1. Bryan voit ses jetons : ' || count(*) || '   (attendu : 1)' from public.push_tokens;
\echo ' 2. Jeton mal formé   (attendu : refus, check)'
savepoint t; select public.register_push_token('<script>alert(1)</script>'); rollback to t;
\echo ' 3. Insert direct, sans la fonction   (attendu : refus, permission)'
savepoint t; insert into public.push_tokens (token, profile_id) values ('ExponentPushToken[direct]', '00000000-0000-0000-0000-00000000000a'); rollback to t;
\echo ' 4. Bryan donne son jeton à sa compagne par update   (attendu : refus, permission)'
savepoint t; update public.push_tokens set profile_id = '00000000-0000-0000-0000-00000000000b'; rollback to t;

\echo '=== LA COMPAGNE NE TOUCHE PAS AUX JETONS DE BRYAN'
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select ' 5. Elle voit les jetons de Bryan : ' || count(*) || '   (attendu : 0)' from public.push_tokens;
with d as (delete from public.push_tokens returning 1) select ' 6. Elle supprime les jetons de Bryan : ' || count(*) || ' ligne(s)   (attendu : 0)' from d;

\echo '=== TÉLÉPHONE PARTAGÉ : ELLE SE CONNECTE SUR CELUI DE BRYAN'
select public.register_push_token('ExponentPushToken[telephoneBryan]');
select ' 7. Le jeton est à elle : ' || count(*) || '   (attendu : 1)' from public.push_tokens;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select ' 8. Bryan ne le voit plus : ' || count(*) || '   (attendu : 0)' from public.push_tokens;

\echo '=== PLUSIEURS TÉLÉPHONES, DÉCONNEXION'
select public.register_push_token('ExponentPushToken[nouveauTelephone]');
select public.register_push_token('ExponentPushToken[tablette]');
delete from public.push_tokens where token = 'ExponentPushToken[tablette]';
select ' 9. Bryan se déconnecte de la tablette, il lui reste : ' || string_agg(token, ', ') || '   (attendu : ExponentPushToken[nouveauTelephone])' from public.push_tokens;

\echo '=== SANS CONNEXION, PUIS SUPPRESSION DU COMPTE'
set local request.jwt.claims = '{}';
\echo '10. Appel sans être connecté   (attendu : refus, Authentification requise)'
savepoint t; select public.register_push_token('ExponentPushToken[anonyme]'); rollback to t;
reset role;
delete from public.profiles where id = '00000000-0000-0000-0000-00000000000a';
select '11. Jetons de Bryan après suppression du compte : ' || count(*) || '   (attendu : 0)'
  from public.push_tokens where profile_id = '00000000-0000-0000-0000-00000000000a';
rollback;
