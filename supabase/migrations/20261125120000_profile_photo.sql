-- Photo de profil perso (V1, lot APK, 2026-11-25) : prise avec l'appareil photo ou choisie
-- dans la galerie, recadrée en carré et réduite à 512 px sur le téléphone (la réduction
-- efface aussi les métadonnées, dont la position GPS). Elle remplace l'avatar dessiné.
--
-- Stockage privé : seuls la personne et les membres des groupes (foyers et soirées) qu'elle
-- partage la voient, par des liens temporaires (createSignedUrl). Un invité anonyme n'en
-- envoie pas (pseudo et avatar dessiné seulement).

-- ─── où est la photo ─────────────────────────────────────
-- Chemin dans le bucket avatars : <id du profil>/<uuid>.jpg. Un nouveau nom à chaque envoi :
-- les caches (expo-image) ne montrent jamais l'ancienne photo. La contrainte impose le
-- dossier de la personne : on ne peut pas pointer vers la photo de quelqu'un d'autre.
alter table public.profiles
  add column photo_path text
  constraint profiles_photo_path_check
    check (photo_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$'));

-- Droits par colonne : l'app change sa photo (la RLS limite à son propre profil).
grant update (photo_path) on public.profiles to authenticated;

-- ─── le bucket ───────────────────────────────────────────
-- 1 Mo au plus (une photo de 512 px pèse environ 100 Ko), JPEG seulement : le serveur refuse
-- le reste, même si un client contourne l'app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg']);

-- Partage-t-on un groupe (foyer ou soirée) avec la personne dont le dossier s'appelle
-- folder ? Comparaison en texte : un nom de dossier invalide ne fait pas planter le cast.
-- security definer : lit group_members sans dépendre de ses politiques.
create function public.shares_group_with(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.profile_id = (select auth.uid())
      and theirs.profile_id::text = folder
  );
$$;

revoke execute on function public.shares_group_with(text) from public, anon;
grant execute on function public.shares_group_with(text) to authenticated;

-- ─── règles d'accès aux fichiers ─────────────────────────
-- Écrire et supprimer : seulement dans son propre dossier, avec un vrai compte.
create policy "avatars: envoyées dans son dossier"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not public.is_anonymous_user()
  );

create policy "avatars: supprimées de son dossier"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Lire (et créer un lien temporaire) : sa photo, ou celle de quelqu'un avec qui on partage
-- un groupe. Jamais celle d'un inconnu.
create policy "avatars: visibles par soi et ses co-membres"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.shares_group_with((storage.foldername(name))[1])
    )
  );
