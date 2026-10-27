-- Une seule session de vote ouverte à la fois par groupe (règle du 2026-10-27) :
-- évite que deux membres lancent « ce soir » en parallèle.
-- Index partiel : l'unicité ne porte que sur les lignes où status = 'open',
-- les sessions fermées (l'historique) ne comptent pas.
create unique index vote_sessions_one_open_per_group
  on public.vote_sessions (group_id)
  where status = 'open';
