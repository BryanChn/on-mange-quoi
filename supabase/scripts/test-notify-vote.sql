-- Trigger notify_vote_session et push_tickets : quelles requêtes partent vers notify-vote (9 cas).
-- On lit la file de pg_net (net.http_request_queue) : la requête y attend la validation de la
-- transaction. Transaction annulée à la fin : rien n'est envoyé, la base n'est pas modifiée.
-- Lancer (Supabase local démarré) :
--   docker exec -i supabase_db_on-mange-quoi psql -U postgres -tA < supabase/scripts/test-notify-vote.sql

\set QUIET on
\set ON_ERROR_STOP off
begin;
-- Bryan owner de Famille, sa compagne membre
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Bryan'),
  ('00000000-0000-0000-0000-00000000000b', 'Compagne');
insert into public.groups (id, name, owner_id, invite_code) values
  ('99999999-0000-0000-0000-000000000001', 'Famille', '00000000-0000-0000-0000-00000000000a', 'FAM11111');
insert into public.group_members (group_id, profile_id) values
  ('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a'),
  ('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');

-- Requêtes déjà en file avant le test (envois réels en attente) : on ne compte que les nôtres.
create temporary table queue_start as select coalesce(max(id), 0) as id from net.http_request_queue;
grant select on queue_start to authenticated;

\echo '=== SANS VAULT (base locale, tests) : le vote marche, rien ne part'
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
-- Comme l'app : seules group_id et organizer_id sont écrites, l'id est généré.
insert into public.vote_sessions (group_id, organizer_id) values
  ('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a')
  returning id as first_session \gset
reset role;
select ' 1. Vote lancé sans Vault, requêtes en file : ' || count(*) || '   (attendu : 0)'
  from net.http_request_queue where id > (select id from queue_start);
delete from public.vote_sessions where id = :'first_session';

\echo '=== AVEC VAULT'
select vault.create_secret('http://functions.test/functions/v1', 'edge_functions_url') is not null as url_set \gset
select vault.create_secret('secret-de-test', 'edge_functions_secret') is not null as secret_set \gset

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
insert into public.vote_sessions (group_id, organizer_id) values
  ('99999999-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a')
  returning id as session \gset
\echo ' 2. Le rôle de l app lit Vault   (attendu : refus, permission)'
savepoint t; select decrypted_secret from vault.decrypted_secrets; rollback to t;
reset role;
insert into public.proposals (session_id, name) values (:'session', 'Pizza') returning id as pizza \gset
insert into public.votes (proposal_id, profile_id) values (:'pizza', '00000000-0000-0000-0000-00000000000a');

select ' 3. Lancement : ' || (convert_from(body, 'UTF8')::jsonb ->> 'event')
  || ', bonne session : ' || (convert_from(body, 'UTF8')::jsonb ->> 'session_id' = :'session')
  || ', secret : ' || (headers ->> 'x-internal-secret') || ', url : ' || url
  || '   (attendu : opened, bonne session : true, secret : secret-de-test, url : http://functions.test/functions/v1/notify-vote)'
  from net.http_request_queue where id > (select id from queue_start);
select ' 4. Proposer et voter ne notifient pas, requêtes en file : ' || count(*) || '   (attendu : 1)'
  from net.http_request_queue where id > (select id from queue_start);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select public.close_session(:'session') is not null as closed \gset
reset role;
select ' 5. Clôture : ' || string_agg((convert_from(body, 'UTF8')::jsonb ->> 'event'), ', ' order by id)
  || '   (attendu : opened, closed)'
  from net.http_request_queue where id > (select id from queue_start);

update public.vote_sessions set created_at = created_at
  where id = :'session';
select ' 6. Autre mise à jour d une session clôturée, requêtes en file : ' || count(*) || '   (attendu : 2)'
  from net.http_request_queue where id > (select id from queue_start);

\echo ' 7. Appel direct de call_edge_function par l app   (attendu : refus, permission)'
set local role authenticated;
savepoint t; select public.call_edge_function('notify-vote', '{}'); rollback to t;
\echo ' 8. L app lit push_tickets   (attendu : refus, permission)'
savepoint t; select count(*) from public.push_tickets; rollback to t;
reset role;

insert into public.push_tokens (token, profile_id) values ('ExponentPushToken[ticketTest]', '00000000-0000-0000-0000-00000000000b');
insert into public.push_tickets (id, token) values ('ticket-1', 'ExponentPushToken[ticketTest]');
delete from public.push_tokens where token = 'ExponentPushToken[ticketTest]';
select ' 9. Jeton supprimé, ses tickets restants : ' || count(*) || '   (attendu : 0)' from public.push_tickets where id = 'ticket-1';
rollback;
