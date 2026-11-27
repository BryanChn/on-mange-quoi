-- Type de plat et filtres du carnet (2026-11-27, entrés en V1 : maquette
-- https://claude.ai/artifact/Pg5e2H8YsqvDJYxgzz4dSS). Chaque recette peut avoir un type
-- (Viande, Poisson, Végé, Dessert), affiché en badge sur sa vignette et filtrable dans le
-- carnet, avec les étiquettes déjà là (régimes, durée, budget). « Écrire une recette » choisit
-- le type et les régimes.

-- Liste fermée, un seul type par recette : un filtre fiable. null = pas de type (les recettes
-- écrites avant cette migration).
create type public.recipe_category as enum ('viande', 'poisson', 'vege', 'dessert');

alter table public.recipes add column category public.recipe_category;

grant insert (category) on public.recipes to authenticated;
grant update (category) on public.recipes to authenticated;

-- ─── la copie garde le type ──────────────────────────────
-- Dernière version (migration recipe_chef_tip), avec category en plus.
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
    diets, total_minutes, budget, chef_tip, category
  )
  values (
    target_group_id, base.title, base.servings, base.steps, base.photo_path, base.id, auth.uid(),
    base.diets, base.total_minutes, base.budget, base.chef_tip, base.category
  )
  returning id into copy_id;

  insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id)
  select copy_id, position, raw, label, quantity, unit, food_id
  from public.recipe_ingredients
  where recipe_id = base.id;

  return copy_id;
end;
$$;

-- ─── enregistrer une recette, type et régimes compris ────
-- Même fonction que la migration recipe_chef_tip, avec deux paramètres en plus, en dernier.
-- La signature change : on retire l'ancienne (sinon surcharge, appels ambigus).
-- recipe_category : null = pas de type (enregistrer remplace le type, comme l'astuce).
-- recipe_diets : null = garder les régimes actuels (une version de l'app qui ne les envoie pas
-- encore ne les efface pas) ; un tableau, même vide, les remplace.
drop function public.save_recipe(uuid, text, integer, text[], jsonb, uuid, text);

create function public.save_recipe(
  target_group_id uuid,
  recipe_title text,
  recipe_servings integer,
  recipe_steps text[],
  ingredients jsonb,
  target_recipe_id uuid default null,
  recipe_chef_tip text default null,
  recipe_category public.recipe_category default null,
  recipe_diets public.recipe_diet[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid;
begin
  if jsonb_typeof(ingredients) is distinct from 'array' or jsonb_array_length(ingredients) > 60 then
    raise exception 'Ingrédients invalides' using errcode = '22023', hint = 'invalid_ingredients';
  end if;

  if target_recipe_id is null then
    insert into public.recipes (group_id, title, servings, steps, chef_tip, category, diets)
    values (
      target_group_id, recipe_title, recipe_servings, coalesce(recipe_steps, '{}'),
      recipe_chef_tip, recipe_category, coalesce(recipe_diets, '{}')
    )
    returning id into saved_id;
  else
    update public.recipes
    set title = recipe_title, servings = recipe_servings, steps = coalesce(recipe_steps, '{}'),
      chef_tip = recipe_chef_tip, category = recipe_category,
      diets = coalesce(recipe_diets, diets)
    where id = target_recipe_id and group_id = target_group_id
    returning id into saved_id;
    -- Recette absente, d'un autre foyer, ou de base : la RLS la cache, on le dit.
    if saved_id is null then
      raise exception 'Recette introuvable' using errcode = '42501', hint = 'recipe_not_found';
    end if;
    delete from public.recipe_ingredients where recipe_id = saved_id;
  end if;

  insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id)
  select
    saved_id,
    (item.position - 1)::smallint,
    item.value ->> 'raw',
    item.value ->> 'label',
    (item.value ->> 'quantity')::numeric,
    (item.value ->> 'unit')::public.ingredient_unit,
    (item.value ->> 'food_id')::integer
  from jsonb_array_elements(ingredients) with ordinality as item(value, position);

  return saved_id;
end;
$$;

revoke execute on function public.save_recipe(
  uuid, text, integer, text[], jsonb, uuid, text, public.recipe_category, public.recipe_diet[]
) from public, anon;
grant execute on function public.save_recipe(
  uuid, text, integer, text[], jsonb, uuid, text, public.recipe_category, public.recipe_diet[]
) to authenticated;

-- ─── le type des 20 recettes de base ─────────────────────
-- Aussi dans scripts/base-recipes/lot1.json et lot2.json (champ category), pour qu'un lot
-- régénéré le garde.
update public.recipes set category = v.category::public.recipe_category
from (values
  (1, 'viande'), (2, 'vege'), (3, 'viande'), (4, 'poisson'), (5, 'viande'),
  (6, 'viande'), (7, 'vege'), (8, 'vege'), (9, 'vege'), (10, 'dessert'),
  (11, 'viande'), (12, 'vege'), (13, 'vege'), (14, 'viande'), (15, 'vege'),
  (16, 'vege'), (17, 'vege'), (18, 'vege'), (19, 'poisson'), (20, 'dessert')
) as v(n, category)
where recipes.id = ('00000000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid;

-- Les copies déjà faites prennent le type de leur recette de base.
update public.recipes as copy set category = base.category
from public.recipes as base
where copy.source_recipe_id = base.id and copy.category is null;
