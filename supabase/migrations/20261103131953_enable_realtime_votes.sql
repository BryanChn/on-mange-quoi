-- Temps réel de l'écran du vote : les votes et les plats proposés apparaissent
-- en direct chez tous les membres (MVP, point 6).
-- Supabase n'envoie les changements que des tables ajoutées à la publication
-- supabase_realtime. Chaque abonné ne reçoit que les lignes que la RLS lui laisse lire.
-- vote_sessions viendra avec la clôture.

alter publication supabase_realtime add table public.proposals, public.votes;
