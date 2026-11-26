-- Étiquettes d'une recette, posées à l'écriture (décidé le 26/11) : les filtres de la V2
-- (végétarien, moins de 30 min, budget) les liront sans retravailler les données. Les macros
-- n'ont besoin de rien : elles se calculent depuis Ciqual.

-- Liste fermée : pas de faute de frappe possible, un filtre fiable.
create type public.recipe_diet as enum (
  'vegetarien', 'vegan', 'sans_porc', 'sans_gluten', 'sans_lactose'
);

alter table public.recipes
  add column diets public.recipe_diet[] not null default '{}',
  -- Préparation et cuisson, repos compris : « moins de 30 min » se calcule.
  add column total_minutes smallint check (total_minutes between 1 and 1440),
  -- 1 à 3 (€ à €€€), approximatif : pas de vrais prix disponibles.
  add column budget smallint check (budget between 1 and 3);

grant insert (diets, total_minutes, budget) on public.recipes to authenticated;
grant update (diets, total_minutes, budget) on public.recipes to authenticated;

-- « Ajouter à mon carnet » : la copie garde aussi les étiquettes de la recette de base.
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
    group_id, title, servings, steps, source_recipe_id, created_by, diets, total_minutes, budget
  )
  values (
    target_group_id, base.title, base.servings, base.steps, base.id, auth.uid(),
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
