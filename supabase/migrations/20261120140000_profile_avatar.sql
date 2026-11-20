-- Avatar prédéfini (MVP, ajouté le 2026-11-20) : chacun choisit un dessin (le chat, des
-- spaghetti…) au lieu de son initiale. Retour d'usage : deux membres avaient le même rond
-- de couleur, impossible de les distinguer. La photo perso viendra avec un prochain APK.

-- null = l'initiale, comme avant. Liste fermée : le serveur refuse toute autre valeur
-- (validation côté serveur, l'app n'est pas la seule à pouvoir écrire). Ajouter un avatar,
-- c'est une migration qui élargit cette liste, et le dessin dans l'app.
alter table public.profiles
  add column avatar text
  constraint profiles_avatar_check
    check (avatar in ('chat', 'spaghetti', 'pizza', 'burger', 'avocat', 'ramen'));

-- Droits par colonne (migration restrict_column_privileges) : l'app peut changer son
-- avatar, rien d'autre de plus. La politique RLS d'update (id = auth.uid()) limite à son
-- propre profil.
grant update (avatar) on public.profiles to authenticated;
