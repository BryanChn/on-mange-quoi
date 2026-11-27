-- L'astuce du chef (2026-11-27) : une phrase de chef par recette, dans un encadré signé par le
-- chat cuisinier. Les recettes de base en ont une ; la copie dans un carnet la garde ; un foyer
-- peut écrire ou modifier la sienne (« Écrire une recette », champ facultatif).

-- null = pas d'astuce. Jamais une chaîne vide : l'app envoie null quand le champ est vide.
alter table public.recipes
  add column chef_tip varchar(300) check (length(trim(chef_tip)) > 0);

grant insert (chef_tip) on public.recipes to authenticated;
grant update (chef_tip) on public.recipes to authenticated;

-- Texte rangé comme le titre (un seul espace entre les mots).
drop trigger tidy_text on public.recipes;
create trigger tidy_text before insert or update of title, chef_tip on public.recipes
  for each row execute function public.tidy_text_columns('title', 'chef_tip');

-- ─── la copie garde l'astuce ─────────────────────────────
-- Dernière version (migration base_recipe_photos : étiquettes et photo), avec chef_tip en plus.
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
    diets, total_minutes, budget, chef_tip
  )
  values (
    target_group_id, base.title, base.servings, base.steps, base.photo_path, base.id, auth.uid(),
    base.diets, base.total_minutes, base.budget, base.chef_tip
  )
  returning id into copy_id;

  insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id)
  select copy_id, position, raw, label, quantity, unit, food_id
  from public.recipe_ingredients
  where recipe_id = base.id;

  return copy_id;
end;
$$;

-- ─── enregistrer une recette, astuce comprise ────────────
-- Même fonction que la migration recipes, avec recipe_chef_tip en dernier (null par défaut).
-- La signature change : on retire l'ancienne, sinon les deux coexisteraient (surcharge) et
-- l'appel sans astuce serait ambigu. Enregistrer remplace l'astuce : null l'efface.
drop function public.save_recipe(uuid, text, integer, text[], jsonb, uuid);

create function public.save_recipe(
  target_group_id uuid,
  recipe_title text,
  recipe_servings integer,
  recipe_steps text[],
  ingredients jsonb,
  target_recipe_id uuid default null,
  recipe_chef_tip text default null
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
    insert into public.recipes (group_id, title, servings, steps, chef_tip)
    values (target_group_id, recipe_title, recipe_servings, coalesce(recipe_steps, '{}'), recipe_chef_tip)
    returning id into saved_id;
  else
    update public.recipes
    set title = recipe_title, servings = recipe_servings, steps = coalesce(recipe_steps, '{}'),
      chef_tip = recipe_chef_tip
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

revoke execute on function public.save_recipe(uuid, text, integer, text[], jsonb, uuid, text) from public, anon;
grant execute on function public.save_recipe(uuid, text, integer, text[], jsonb, uuid, text) to authenticated;
