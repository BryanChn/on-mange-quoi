-- Scénarios des fonctions de groupe : create_group, join_group, regenerate_invite_code (15 cas).
-- Transaction annulée à la fin : la base n'est pas modifiée.
-- Lancer (Supabase local démarré) :
--   docker exec -i supabase_db_on-mange-quoi psql -U postgres -tA < supabase/scripts/test-group-functions.sql

\set QUIET on
\set ON_ERROR_STOP off
begin;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000a','Bryan'),('00000000-0000-0000-0000-00000000000b','Maman'),('00000000-0000-0000-0000-00000000000c','Tonton');
set local role authenticated;

\echo '=== create_group'
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select set_config('test.gid', (public.create_group('  Famille  ')).id::text, true) \g /dev/null
select ' 1. Bryan crée "  Famille  " -> nom : "' || name || '", code : ' || invite_code
       || case when invite_code ~ '^[A-HJKMNP-Z2-9]{8}$' then ' (format OK)' else ' (FORMAT KO)' end from public.groups;
select ' 2. Bryan est membre : ' || count(*) || '   (attendu : 1)' from public.group_members;
\echo ' 3. Nom vide   (attendu : refus check)'
savepoint t; select public.create_group('   '); rollback to t;
reset role;
select ' 4. 200 codes tirés (admin), doublons : ' || (200 - count(distinct c)) || '   (attendu : 0)' from (select public.generate_invite_code() c from generate_series(1,200)) s;
set local role authenticated;

\echo '=== join_group'
reset role;
select set_config('test.code', invite_code, true) from public.groups \g /dev/null
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select ' 5. Maman rejoint avec le code en minuscules et espacé -> ' || case when public.join_group(lower(substr(current_setting('test.code'),1,4)) || ' ' || lower(substr(current_setting('test.code'),5))) = current_setting('test.gid')::uuid then 'OK' else 'KO' end;
select ' 6. Maman rejoint une 2e fois -> ' || case when public.join_group(current_setting('test.code')) is not null then 'OK, sans erreur' end;
select ' 7. Maman voit ' || count(*) || ' membres   (attendu : 2)' from public.group_members;
\echo ' 8. Code inexistant   (attendu : refus)'
savepoint t; select public.join_group('ZZZZZZZZ'); rollback to t;

\echo '=== regenerate_invite_code'
\echo ' 9. Maman (pas owner) régénère   (attendu : refus)'
savepoint t; select public.regenerate_invite_code(current_setting('test.gid')::uuid); rollback to t;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select '10. Bryan régénère -> nouveau code différent : ' || (public.regenerate_invite_code(current_setting('test.gid')::uuid) <> current_setting('test.code'));
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
\echo '11. Tonton utilise l ancien code   (attendu : refus)'
savepoint t; select public.join_group(current_setting('test.code')); rollback to t;

\echo '=== droits directs'
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
\echo '12. Bryan met son code à AAAA par update direct   (attendu : refus)'
savepoint t; update public.groups set invite_code = 'AAAA'; rollback to t;
with u as (update public.groups set name = 'La Famille' returning 1) select '13. Bryan renomme par update direct : ' || count(*) || '   (attendu : 1)' from u;
\echo '14. Bryan appelle generate_invite_code directement   (attendu : refus)'
savepoint t; select public.generate_invite_code(); rollback to t;
reset role; set local role anon;
\echo '15. Visiteur non connecté appelle create_group   (attendu : refus)'
savepoint t; select public.create_group('Pirate'); rollback to t;
rollback;
