-- Rappel unique (MVP, ajouté le 2026-11-20) : un membre qui n'a ni proposé ni voté reçoit
-- une seule relance, 1 h après le lancement du vote. Raison : un membre qui travaille tard
-- rate la notification de lancement, et la décision n'est plus collective.
--
-- Règles (tranchées le 2026-11-20) :
--   - une seule fois par vote, jamais répétée (une relance toutes les X heures fait couper
--     les notifications, lancement et résultat compris) ;
--   - au plus tôt 1 h après le lancement, au plus tard 3 h après (un vote oublié depuis la
--     veille ne relance personne le lendemain matin) ;
--   - entre 10 h et 21 h, heure de Paris ;
--   - seulement s'il reste un membre (hors organisateur) sans plat proposé ni vote ;
--   - rien si le vote est clôturé.
-- Qui relancer exactement est recalculé par notify-vote au moment de l'envoi.

-- ─── marque « rappel envoyé » ────────────────────────────
-- Écrite seulement par send_vote_reminders : l'app n'a aucun droit d'écriture sur cette
-- colonne (droits par colonne, migration restrict_column_privileges).
alter table public.vote_sessions add column reminder_sent_at timestamptz;

-- ─── send_vote_reminders ─────────────────────────────────
-- reference_time : « maintenant » par défaut ; un paramètre pour que les tests choisissent
-- l'heure (sinon un test lancé à 23 h échouerait). Renvoie le nombre de votes relancés.
-- La marque et l'appel partent dans la même transaction : un vote n'est jamais relancé deux
-- fois, même si deux exécutions se chevauchent (update … where reminder_sent_at is null).
create function public.send_vote_reminders(reference_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  paris_time time := (reference_time at time zone 'Europe/Paris')::time;
  reminded_session_id uuid;
  reminded_count integer := 0;
begin
  if paris_time < time '10:00' or paris_time >= time '21:00' then
    return 0;
  end if;

  for reminded_session_id in
    update public.vote_sessions as s
    set reminder_sent_at = reference_time
    where s.status = 'open'
      and s.reminder_sent_at is null
      and s.created_at <= reference_time - interval '1 hour'
      and s.created_at > reference_time - interval '3 hours'
      and exists (
        select 1
        from public.group_members as m
        where m.group_id = s.group_id
          and m.profile_id is distinct from s.organizer_id
          and not exists (
            select 1 from public.proposals as p
            where p.session_id = s.id and p.proposed_by = m.profile_id
          )
          and not exists (
            select 1
            from public.votes as v
            join public.proposals as p on p.id = v.proposal_id
            where p.session_id = s.id and v.profile_id = m.profile_id
          )
      )
    returning s.id
  loop
    perform public.call_edge_function(
      'notify-vote',
      jsonb_build_object('session_id', reminded_session_id, 'event', 'reminder')
    );
    reminded_count := reminded_count + 1;
  end loop;

  return reminded_count;
end;
$$;

-- Réservée à pg_cron (et aux tests, avec la clé service_role) : jamais depuis l'app.
revoke execute on function public.send_vote_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.send_vote_reminders(timestamptz) to service_role;

-- ─── tâche planifiée ─────────────────────────────────────
-- Toutes les 10 minutes : un rappel part au plus 10 min après l'heure prévue.
select cron.schedule(
  'vote-reminders',
  '*/10 * * * *',
  $$ select public.send_vote_reminders() $$
);
