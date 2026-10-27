-- Politiques RLS du MVP : un membre ne voit que ses groupes et ce qu'ils contiennent.
-- Règles détaillées dans docs/schema.md. Toute action absente d'ici est refusée.
-- (select auth.uid()) plutôt que auth.uid() : évalué une fois par requête, pas par ligne.

-- ─── fonction utilitaire ─────────────────────────────────

-- L'utilisateur connecté est-il membre de ce groupe ?
-- security definer : lit group_members sans repasser par sa RLS, ce qui évite
-- une récursion infinie quand les politiques de group_members l'appellent.
-- search_path vide : empêche de détourner la fonction avec un objet homonyme.
create function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and profile_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

-- Une proposition a-t-elle reçu au moins un vote ?
-- security definer pour la même raison : la politique delete de proposals lit votes,
-- dont la politique select relit proposals (récursion infinie sinon).
create function public.proposal_has_votes(target_proposal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.votes where proposal_id = target_proposal_id
  );
$$;

revoke execute on function public.proposal_has_votes(uuid) from public, anon;
grant execute on function public.proposal_has_votes(uuid) to authenticated;

-- ─── profiles ────────────────────────────────────────────
-- Pas de delete : un profil part avec son compte (cascade depuis auth.users),
-- via le parcours de suppression de compte.

-- Son propre profil, et ceux des personnes avec qui on partage un groupe
-- (pour afficher « Maman a voté »). Jamais ceux des autres groupes.
create policy "profiles: visibles par soi et ses co-membres"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.group_members gm
      where gm.profile_id = id and public.is_group_member(gm.group_id)
    )
  );

-- Créé par l'utilisateur lui-même à la première connexion (choix du nom affiché).
create policy "profiles: créé par soi"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "profiles: modifié par soi"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ─── groups ──────────────────────────────────────────────
-- Pas de politique insert : la création passe par une fonction (groupe, code
-- d'invitation et ajout de l'owner dans une seule transaction).

create policy "groups: visible par ses membres et son owner"
  on public.groups for select
  to authenticated
  using (owner_id = (select auth.uid()) or public.is_group_member(id));

-- with check : l'owner ne peut pas céder le groupe par un simple update ;
-- le transfert d'ownership passera par une fonction dédiée.
create policy "groups: modifiable par son owner"
  on public.groups for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "groups: dissous par son owner"
  on public.groups for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ─── group_members ───────────────────────────────────────
-- Pas de politique insert : rejoindre passe par une fonction qui vérifie le code
-- d'invitation. Pas d'update : une appartenance ne se modifie pas.

create policy "group_members: visibles par les membres du groupe"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

-- L'owner retire les autres ; un membre peut partir de lui-même.
-- L'owner ne peut pas se retirer ainsi : son départ passe par une fonction
-- qui transfère d'abord l'ownership (sinon groupe sans owner membre).
create policy "group_members: retrait par l'owner ou départ volontaire"
  on public.group_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_id
        and (
          (g.owner_id = (select auth.uid()) and profile_id <> (select auth.uid()))
          or (profile_id = (select auth.uid()) and g.owner_id <> (select auth.uid()))
        )
    )
  );

-- ─── vote_sessions ───────────────────────────────────────
-- Pas d'update : la clôture passe par une fonction qui calcule le gagnant et fait
-- le tirage côté serveur (sinon l'organisateur pourrait imposer un plat).
-- Pas de delete : l'historique est conservé ; une session part avec son groupe.

create policy "vote_sessions: visibles par les membres du groupe"
  on public.vote_sessions for select
  to authenticated
  using (public.is_group_member(group_id));

-- Tout membre peut lancer une session, en son propre nom.
create policy "vote_sessions: lancées par un membre"
  on public.vote_sessions for insert
  to authenticated
  with check (
    organizer_id = (select auth.uid())
    and public.is_group_member(group_id)
    and status = 'open'
  );

-- ─── proposals ───────────────────────────────────────────
-- Pas d'update : pour corriger un nom, on retire et on repropose.

create policy "proposals: visibles par les membres du groupe"
  on public.proposals for select
  to authenticated
  using (
    exists (
      select 1 from public.vote_sessions s
      where s.id = session_id and public.is_group_member(s.group_id)
    )
  );

-- Tout membre propose, en son nom, tant que la session est ouverte.
create policy "proposals: proposées par un membre, session ouverte"
  on public.proposals for insert
  to authenticated
  with check (
    proposed_by = (select auth.uid())
    and exists (
      select 1 from public.vote_sessions s
      where s.id = session_id
        and s.status = 'open'
        and public.is_group_member(s.group_id)
    )
  );

-- Retrait par son auteur seulement, session ouverte, et tant que personne n'a voté
-- pour ce plat (personne n'est lésé).
create policy "proposals: retirées par l'auteur si aucun vote"
  on public.proposals for delete
  to authenticated
  using (
    proposed_by = (select auth.uid())
    and exists (
      select 1 from public.vote_sessions s
      where s.id = session_id and s.status = 'open'
    )
    and not public.proposal_has_votes(id)
  );

-- ─── votes ───────────────────────────────────────────────
-- Cocher = insert, décocher = delete, tant que la session est ouverte.
-- Pas d'update : un vote n'a rien de modifiable.

create policy "votes: visibles par les membres du groupe"
  on public.votes for select
  to authenticated
  using (
    exists (
      select 1
      from public.proposals p
      join public.vote_sessions s on s.id = p.session_id
      where p.id = proposal_id and public.is_group_member(s.group_id)
    )
  );

create policy "votes: cochés par un membre, session ouverte"
  on public.votes for insert
  to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1
      from public.proposals p
      join public.vote_sessions s on s.id = p.session_id
      where p.id = proposal_id
        and s.status = 'open'
        and public.is_group_member(s.group_id)
    )
  );

create policy "votes: décochés par leur auteur, session ouverte"
  on public.votes for delete
  to authenticated
  using (
    profile_id = (select auth.uid())
    and exists (
      select 1
      from public.proposals p
      join public.vote_sessions s on s.id = p.session_id
      where p.id = proposal_id and s.status = 'open'
    )
  );
