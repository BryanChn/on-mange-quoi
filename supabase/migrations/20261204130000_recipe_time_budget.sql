-- Durée et budget dans « Écrire une recette » (2026-11-27) : sans eux, les filtres du carnet
-- « ≤ 30 min » et « Petit budget » écartaient toujours les recettes écrites par le foyer (seules
-- les recettes de base les avaient).

-- Même fonction que la migration recipe_category, avec deux paramètres en plus, en dernier.
-- La signature change : on retire l'ancienne (sinon surcharge, appels ambigus).
-- recipe_total_minutes et recipe_budget : null = garder la valeur actuelle (une version de
-- l'app qui ne les envoie pas encore ne les efface pas) ; 0 = l'effacer (champ vidé) ; sinon la
-- nouvelle valeur, vérifiée par les contraintes de la table (1 à 1440 min, budget 1 à 3).
drop function public.save_recipe(
  uuid, text, integer, text[], jsonb, uuid, text, public.recipe_category, public.recipe_diet[]
);

create function public.save_recipe(
  target_group_id uuid,
  recipe_title text,
  recipe_servings integer,
  recipe_steps text[],
  ingredients jsonb,
  target_recipe_id uuid default null,
  recipe_chef_tip text default null,
  recipe_category public.recipe_category default null,
  recipe_diets public.recipe_diet[] default null,
  recipe_total_minutes smallint default null,
  recipe_budget smallint default null
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
    insert into public.recipes (
      group_id, title, servings, steps, chef_tip, category, diets, total_minutes, budget
    )
    values (
      target_group_id, recipe_title, recipe_servings, coalesce(recipe_steps, '{}'),
      recipe_chef_tip, recipe_category, coalesce(recipe_diets, '{}'),
      nullif(recipe_total_minutes, 0), nullif(recipe_budget, 0)
    )
    returning id into saved_id;
  else
    update public.recipes
    set title = recipe_title, servings = recipe_servings, steps = coalesce(recipe_steps, '{}'),
      chef_tip = recipe_chef_tip, category = recipe_category,
      diets = coalesce(recipe_diets, diets),
      total_minutes = case when recipe_total_minutes is null then total_minutes
        else nullif(recipe_total_minutes, 0) end,
      budget = case when recipe_budget is null then budget else nullif(recipe_budget, 0) end
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
  uuid, text, integer, text[], jsonb, uuid, text, public.recipe_category, public.recipe_diet[],
  smallint, smallint
) from public, anon;
grant execute on function public.save_recipe(
  uuid, text, integer, text[], jsonb, uuid, text, public.recipe_category, public.recipe_diet[],
  smallint, smallint
) to authenticated;
