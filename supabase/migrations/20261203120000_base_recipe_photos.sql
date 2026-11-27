-- Photos des recettes de base (demandé le 2026-11-26).
-- Une recette de base n'a pas de foyer, donc pas de dossier : sa photo vit dans le dossier
-- « base/ » du bucket recipe-photos, sous le nom <id de la recette>.jpg. Les fichiers y sont
-- envoyés par Claude avec la clé service_role (jamais depuis l'app), photos CC0 ou domaine
-- public seulement : elles sont montrées à tous les foyers et sur les stores.
--
-- La copie dans un carnet (« Ajouter à mon carnet ») garde la même photo, sans la dupliquer :
-- elle pointe vers le fichier de base. Le foyer peut la remplacer par la sienne ; l'originale
-- reste, personne ne peut l'effacer depuis l'app.

-- ─── la contrainte du chemin ─────────────────────────────
-- Avant : seulement <foyer>/<uuid>.jpg. En plus maintenant : base/<uuid>.jpg, pour une recette
-- de base ou pour une copie. Une recette écrite par le foyer ne pointe jamais vers base/.
alter table public.recipes drop constraint recipes_photo_path_check;
alter table public.recipes add constraint recipes_photo_path_check check (
  photo_path is null
  or (group_id is not null and photo_path ~ ('^' || group_id::text || '/[0-9a-f-]{36}\.jpg$'))
  or (
    (group_id is null or source_recipe_id is not null)
    and photo_path ~ '^base/[0-9a-f-]{36}\.jpg$'
  )
);

-- ─── le stockage ─────────────────────────────────────────
-- Lecture seule, pour les comptes : les recettes de base ne sont pas montrées aux invités
-- anonymes (même règle que la table recipes). Pas de règle d'envoi ni de retrait pour base/ :
-- les règles existantes passent par is_foyer_member_folder, qui répond non pour « base ».
create policy "recipe-photos: photos des recettes de base, visibles par les comptes"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = 'base'
    and not public.is_anonymous_user()
  );

-- ─── la copie garde la photo ─────────────────────────────
-- Dernière version (migration recipe_tags, étiquettes comprises), avec photo_path en plus.
create or replace function public.copy_base_recipe(base_recipe_id uuid, target_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  base public.recipes;
  copy_id uuid;
begin
  if not public.is_foyer_member(target_group_id) then
    raise exception 'Foyer introuvable' using errcode = '42501', hint = 'not_member';
  end if;

  select * into base from public.recipes where id = base_recipe_id and group_id is null;
  if base.id is null then
    raise exception 'Recette de base introuvable' using errcode = '22023', hint = 'base_not_found';
  end if;

  select id into copy_id from public.recipes
  where group_id = target_group_id and source_recipe_id = base.id;
  if copy_id is not null then
    return copy_id;
  end if;

  insert into public.recipes (
    group_id, title, servings, steps, photo_path, source_recipe_id, created_by,
    diets, total_minutes, budget
  )
  values (
    target_group_id, base.title, base.servings, base.steps, base.photo_path, base.id, auth.uid(),
    base.diets, base.total_minutes, base.budget
  )
  returning id into copy_id;

  insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id)
  select copy_id, position, raw, label, quantity, unit, food_id
  from public.recipe_ingredients
  where recipe_id = base.id;

  return copy_id;
end;
$$;
