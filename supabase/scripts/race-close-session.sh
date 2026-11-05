#!/usr/bin/env bash
# Course entre un vote et la clôture (verrou de 20261105123152_close_session_realtime_and_lock).
# Deux connexions simultanées sur la base locale ; les données créées sont supprimées à la fin.
# Lancer : npm run db:test:race   (Supabase local démarré)
set -u
P="docker exec -i supabase_db_on-mange-quoi psql -U postgres -tAq"
SESSION=11111111-0000-0000-0000-0000000000f1
PIZZA=22222222-0000-0000-0000-0000000000f1
CURRY=22222222-0000-0000-0000-0000000000f2
BRYAN=00000000-0000-0000-0000-0000000000a1
MAMAN=00000000-0000-0000-0000-0000000000b1
TONTON=00000000-0000-0000-0000-0000000000c1
GROUP=99999999-0000-0000-0000-0000000000f1

as_user() { echo "begin; set local role authenticated; set local request.jwt.claims = '{\"sub\":\"$1\",\"role\":\"authenticated\"}';"; }

cleanup() {
  $P <<SQL
delete from public.groups where id = '$GROUP';
delete from auth.users where id in ('$BRYAN','$MAMAN','$TONTON');
SQL
}

# Pizza 1 (Bryan), Curry 1 (Maman) : égalité, Maman organise.
setup() {
  cleanup
  $P <<SQL
insert into auth.users (id) values ('$BRYAN'),('$MAMAN'),('$TONTON');
insert into public.profiles (id, display_name) values ('$BRYAN','Bryan'),('$MAMAN','Maman'),('$TONTON','Tonton');
insert into public.groups (id, name, owner_id, invite_code) values ('$GROUP','Course','$BRYAN','RACE1111');
insert into public.group_members values ('$GROUP','$BRYAN'),('$GROUP','$MAMAN'),('$GROUP','$TONTON');
insert into public.vote_sessions (id, group_id, organizer_id) values ('$SESSION','$GROUP','$MAMAN');
insert into public.proposals (id, session_id, name) values ('$PIZZA','$SESSION','Pizza'),('$CURRY','$SESSION','Curry');
insert into public.votes values ('$PIZZA','$BRYAN'),('$CURRY','$MAMAN');
SQL
}

result() {
  $P <<SQL
select '   obtenu : ' || string_agg(p.name || ' ' || (select count(*) from public.votes v where v.proposal_id = p.id), ', ' order by p.name)
  || ' -> gagnant ' || (select w.name || ' par ' || s.decided_by from public.vote_sessions s join public.proposals w on w.id = s.winner_proposal_id where s.id = '$SESSION')
from public.proposals p where p.session_id = '$SESSION';
SQL
}

echo "1. Tonton vote Curry (validé 3 s plus tard) ; Maman clôture entre-temps en imposant Pizza"
echo "   attendu : Curry 2, Pizza 1 -> gagnant Curry par vote (la clôture attend le vote)"
setup
{ as_user "$TONTON"; echo "insert into public.votes values ('$CURRY','$TONTON'); select pg_sleep(3); commit;"; } | $P >/dev/null &
sleep 1
{ as_user "$MAMAN"; echo "select public.close_session('$SESSION','organisateur','$PIZZA'); commit;"; } | $P >/dev/null
wait
result

echo "2. Maman clôture par tirage (validé 3 s plus tard) ; Tonton vote Curry entre-temps"
echo "   attendu : refus du vote (session_closed), Curry 1, Pizza 1 -> gagnant par tirage"
setup
{ as_user "$MAMAN"; echo "select public.close_session('$SESSION','tirage'); select pg_sleep(3); commit;"; } | $P >/dev/null &
sleep 1
{ as_user "$TONTON"; echo "insert into public.votes values ('$CURRY','$TONTON'); commit;"; } | $P 2>&1 | grep -o "HINT:.*" | sed 's/^/   /'
wait
result

cleanup
