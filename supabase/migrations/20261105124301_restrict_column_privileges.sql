-- Droits par colonne (faille trouvée à l'audit du 2026-11-05) : la RLS dit quelles LIGNES
-- un membre peut écrire, pas quelles COLONNES. Supabase accorde par défaut insert et update
-- sur toutes les colonnes : un membre pouvait choisir created_at (une session datée de 2099
-- restait « le dernier vote » du groupe), l'id d'une ligne, ou dater son profil.
-- Assignation de masse (OWASP API3) : on n'accorde que les colonnes que l'app écrit.
-- Les valeurs serveur (id, created_at, status, résultat) viennent des défauts et des fonctions.

-- Révoquer au niveau de la table retire aussi les droits par colonne déjà accordés
-- (groups.name) : ils sont redonnés ci-dessous. anon n'écrit jamais (pas de politique).
revoke insert, update on
  public.profiles, public.groups, public.group_members,
  public.vote_sessions, public.proposals, public.votes
from anon, authenticated;

-- Choix du nom : upsert = insert … on conflict do update set id, display_name.
-- update sur id est donc requis ; la RLS (id = auth.uid()) empêche de le changer.
grant insert (id, display_name), update (id, display_name) on public.profiles to authenticated;

-- Renommer le groupe ; création, adhésion et code d'invitation passent par des fonctions.
grant update (name) on public.groups to authenticated;

-- Lancer un vote : status, résultat et dates prennent leur valeur par défaut.
grant insert (group_id, organizer_id) on public.vote_sessions to authenticated;

grant insert (session_id, name, proposed_by) on public.proposals to authenticated;

grant insert (proposal_id, profile_id) on public.votes to authenticated;
