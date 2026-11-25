-- Recettes (V1 · Cuisiner, étude du 2026-11-25 : https://claude.ai/artifact/SbaydwqqNZ36yrqnLn2yH2).
-- Un carnet par foyer, partagé et modifiable par tous ses membres, et des « Recettes de base »
-- écrites pour l'app, que chaque foyer copie dans son carnet puis adapte. Chaque ingrédient
-- peut être relié à un aliment de la table Ciqual (Anses) : c'est ce qui permet d'estimer les
-- calories et les macros par part. La table des aliments est remplie par une migration à part.
--
-- Une seule table pour les deux sortes de recettes : group_id = le foyer, ou null pour une
-- recette de base (lisible par tous les comptes, écrite par personne, sauf les migrations).

-- ─── aliments (table Ciqual, remplie plus tard) ──────────
-- Valeurs pour 100 g. null = inconnu dans Ciqual (pas zéro). unit_weight_g : poids moyen
-- d'une pièce (« 2 œufs », « 1 oignon »), null quand on ne compte pas cet aliment à la pièce.
create table public.foods (
  id            integer primary key,          -- le code Ciqual de l'aliment (alim_code)
  name          varchar(200) not null,
  group_name    varchar(120),
  kcal          numeric(7, 2) check (kcal >= 0),
  protein_g     numeric(6, 2) check (protein_g >= 0),
  carbs_g       numeric(6, 2) check (carbs_g >= 0),
  fat_g         numeric(6, 2) check (fat_g >= 0),
  unit_weight_g numeric(6, 1) check (unit_weight_g > 0)
);

alter table public.foods enable row level security;

-- Référence publique pour les comptes : lecture seule, jamais d'écriture depuis l'app.
create policy "foods: lisibles par les comptes"
  on public.foods for select
  to authenticated
  using (not public.is_anonymous_user());

revoke all on public.foods from anon, authenticated;
grant select on public.foods to authenticated;

-- ─── unités ──────────────────────────────────────────────
-- Liste fermée : ce que l'app sait lire et convertir. Sans unité (« 2 œufs ») = null.
create type public.ingredient_unit as enum (
  'g', 'kg', 'ml', 'cl', 'l', 'cuillere_cafe', 'cuillere_soupe', 'pincee'
);

-- ─── recettes ────────────────────────────────────────────
-- Étapes : du texte, dans l'ordre, 40 au plus, chacune non vide et de 500 caractères au plus.
create function public.recipe_steps_are_valid(steps text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(steps) <= 40
    and not exists (
      select 1 from unnest(steps) as step
      where step is null or length(step) = 0 or length(step) > 500
    );
$$;

create table public.recipes (
  id               uuid primary key default gen_random_uuid(),
  -- Le foyer du carnet, ou null pour une recette de base. Le foyer effacé emporte son carnet.
  group_id         uuid references public.groups (id) on delete cascade,
  title            varchar(80) not null check (length(trim(title)) > 0),
  servings         smallint not null default 4 check (servings between 1 and 20),
  steps            text[] not null default '{}'
                   check (public.recipe_steps_are_valid(steps)),
  -- Photo dans le bucket recipe-photos : <foyer>/<uuid>.jpg. Une recette de base n'en a pas.
  photo_path       text,
  -- Copie d'une recette de base : laquelle (« déjà dans ton carnet »). Base retirée : la copie reste.
  source_recipe_id uuid references public.recipes (id) on delete set null,
  -- Posé par le serveur, jamais par l'app. Compte supprimé : la recette reste au foyer.
  created_by       uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint recipes_photo_path_check check (
    photo_path is null
    or (group_id is not null and photo_path ~ ('^' || group_id::text || '/[0-9a-f-]{36}\.jpg$'))
  ),
  -- Une copie vit dans un carnet, jamais parmi les recettes de base.
  constraint recipes_copy_in_carnet check (source_recipe_id is null or group_id is not null)
);

create index recipes_group_idx on public.recipes (group_id);
-- Une recette de base au plus une fois par carnet : la copier encore rend la même copie.
create unique index recipes_one_copy_per_carnet
  on public.recipes (group_id, source_recipe_id)
  where source_recipe_id is not null;

alter table public.recipes enable row level security;

-- Droits par colonne : l'app écrit le contenu ; ni l'id, ni l'auteur, ni les dates, ni la
-- source d'une copie (copy_base_recipe). Le foyer ne change jamais après la création.
revoke all on public.recipes from anon, authenticated;
grant select, delete on public.recipes to authenticated;
grant insert (group_id, title, servings, steps, photo_path) on public.recipes to authenticated;
grant update (title, servings, steps, photo_path) on public.recipes to authenticated;

-- Le carnet de son foyer, et les recettes de base (jamais pour un invité anonyme).
create policy "recipes: carnet du foyer et recettes de base"
  on public.recipes for select
  to authenticated
  using (
    public.is_foyer_member(group_id)
    or (group_id is null and not public.is_anonymous_user())
  );

-- Écrire : seulement dans le carnet d'un foyer dont on est membre. group_id null (une
-- recette de base) ou une soirée : is_foyer_member répond non.
create policy "recipes: ajoutées par un membre du foyer"
  on public.recipes for insert
  to authenticated
  with check (public.is_foyer_member(group_id));

create policy "recipes: modifiées par un membre du foyer"
  on public.recipes for update
  to authenticated
  using (public.is_foyer_member(group_id))
  with check (public.is_foyer_member(group_id));

create policy "recipes: retirées par un membre du foyer"
  on public.recipes for delete
  to authenticated
  using (public.is_foyer_member(group_id));

-- Texte propre (trigger tidy_text : un seul espace entre les mots), étapes comprises.
create trigger tidy_text before insert or update of title on public.recipes
  for each row execute function public.tidy_text_columns('title');

create function public.tidy_recipe_steps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.steps := coalesce(
    (select array_agg(public.tidy_text(step) order by position)
     from unnest(new.steps) with ordinality as s(step, position)),
    '{}'
  );
  return new;
end;
$$;

create trigger tidy_steps before insert or update of steps on public.recipes
  for each row execute function public.tidy_recipe_steps();

create function public.touch_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.touch_recipe() from public, anon, authenticated;

create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_recipe();

-- ─── ingrédients ─────────────────────────────────────────
-- Une ligne = un ingrédient, dans l'ordre (position). raw garde la ligne telle qu'écrite :
-- si la lecture de l'app se trompe, l'humain voit encore ce qu'il a tapé.
create table public.recipe_ingredients (
  id        uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position  smallint not null check (position >= 0),
  raw       varchar(120) not null check (length(trim(raw)) > 0),
  label     varchar(80) not null check (length(trim(label)) > 0),
  -- null = pas de quantité chiffrée (« sel », « une pincée de poivre »).
  quantity  numeric(8, 2) check (quantity > 0 and quantity <= 100000),
  unit      public.ingredient_unit,
  -- L'aliment Ciqual choisi à l'autocomplétion ; null = texte libre, pas compté dans les macros.
  food_id   integer references public.foods (id) on delete set null,
  constraint recipe_ingredients_unit_needs_quantity check (unit is null or quantity is not null),
  unique (recipe_id, position)
);

create index recipe_ingredients_food_idx on public.recipe_ingredients (food_id);

alter table public.recipe_ingredients enable row level security;

-- Peut-on lire / écrire les ingrédients de cette recette ? Celles de son carnet ; en lecture
-- seule, aussi celles de base. security definer : lit recipes sans repasser par sa RLS.
create function public.can_read_recipe(target_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = target_recipe_id
      and (public.is_foyer_member(r.group_id) or (r.group_id is null and not public.is_anonymous_user()))
  );
$$;

create function public.can_edit_recipe(target_recipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.recipes r
    where r.id = target_recipe_id and public.is_foyer_member(r.group_id)
  );
$$;

revoke execute on function public.can_read_recipe(uuid), public.can_edit_recipe(uuid) from public, anon;
grant execute on function public.can_read_recipe(uuid), public.can_edit_recipe(uuid) to authenticated;

revoke all on public.recipe_ingredients from anon, authenticated;
grant select, delete on public.recipe_ingredients to authenticated;
grant insert (recipe_id, position, raw, label, quantity, unit, food_id)
  on public.recipe_ingredients to authenticated;
grant update (position, raw, label, quantity, unit, food_id)
  on public.recipe_ingredients to authenticated;

create policy "recipe_ingredients: lisibles avec leur recette"
  on public.recipe_ingredients for select
  to authenticated
  using (public.can_read_recipe(recipe_id));

create policy "recipe_ingredients: ajoutés par un membre du foyer"
  on public.recipe_ingredients for insert
  to authenticated
  with check (public.can_edit_recipe(recipe_id));

create policy "recipe_ingredients: modifiés par un membre du foyer"
  on public.recipe_ingredients for update
  to authenticated
  using (public.can_edit_recipe(recipe_id))
  with check (public.can_edit_recipe(recipe_id));

create policy "recipe_ingredients: retirés par un membre du foyer"
  on public.recipe_ingredients for delete
  to authenticated
  using (public.can_edit_recipe(recipe_id));

create trigger tidy_text before insert or update of raw, label on public.recipe_ingredients
  for each row execute function public.tidy_text_columns('raw', 'label');

-- ─── enregistrer une recette ─────────────────────────────
-- L'écran « Écrire une recette » envoie tout d'un coup : la recette et la liste complète de
-- ses ingrédients, dans l'ordre. Une seule transaction : jamais une recette à moitié écrite.
-- security invoker : la RLS et les droits par colonne de l'appelant s'appliquent à chaque
-- écriture (un non-membre est refusé comme s'il écrivait lui-même dans les tables).
-- ingredients : [{"raw", "label", "quantity"?, "unit"?, "food_id"?}, …], 60 au plus.
-- target_recipe_id en dernier, null par défaut : une nouvelle recette.
create function public.save_recipe(
  target_group_id uuid,
  recipe_title text,
  recipe_servings integer,
  recipe_steps text[],
  ingredients jsonb,
  target_recipe_id uuid default null
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
    insert into public.recipes (group_id, title, servings, steps)
    values (target_group_id, recipe_title, recipe_servings, coalesce(recipe_steps, '{}'))
    returning id into saved_id;
  else
    update public.recipes
    set title = recipe_title, servings = recipe_servings, steps = coalesce(recipe_steps, '{}')
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

revoke execute on function public.save_recipe(uuid, text, integer, text[], jsonb, uuid) from public, anon;
grant execute on function public.save_recipe(uuid, text, integer, text[], jsonb, uuid) to authenticated;

-- ─── copier une recette de base dans son carnet ──────────
-- « Ajouter à mon carnet » : une copie que le foyer modifie librement. Déjà copiée : la même
-- copie est rendue (pas de doublon). security definer : la copie de source_recipe_id et des
-- ingrédients n'est pas ouverte à l'app ; les vérifications sont faites ici.
create function public.copy_base_recipe(base_recipe_id uuid, target_group_id uuid)
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

  insert into public.recipes (group_id, title, servings, steps, source_recipe_id, created_by)
  values (target_group_id, base.title, base.servings, base.steps, base.id, auth.uid())
  returning id into copy_id;

  insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id)
  select copy_id, position, raw, label, quantity, unit, food_id
  from public.recipe_ingredients
  where recipe_id = base.id;

  return copy_id;
end;
$$;

revoke execute on function public.copy_base_recipe(uuid, uuid) from public, anon;
grant execute on function public.copy_base_recipe(uuid, uuid) to authenticated;

-- ─── d'où viennent une proposition et un article ─────────
-- Une proposition de vote peut être une recette du carnet (« Voir la recette » au résultat),
-- un article de courses peut venir d'une recette (« pour Bolognaise »). La recette retirée,
-- les deux restent, sans le lien.
alter table public.proposals
  add column recipe_id uuid references public.recipes (id) on delete set null;
alter table public.shopping_items
  add column recipe_id uuid references public.recipes (id) on delete set null;

grant insert (recipe_id) on public.proposals to authenticated;
grant insert (recipe_id) on public.shopping_items to authenticated;

-- La recette doit être celle du carnet du même foyer : jamais celle d'un autre foyer, ni une
-- recette de base, ni dans un repas à plusieurs (son groupe n'est pas un foyer).
create function public.check_recipe_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_group_id uuid;
begin
  if new.recipe_id is null then
    return new;
  end if;

  if tg_table_name = 'proposals' then
    select s.group_id into link_group_id from public.vote_sessions s where s.id = new.session_id;
  else
    link_group_id := new.group_id;
  end if;

  if not exists (
    select 1 from public.recipes r
    where r.id = new.recipe_id and r.group_id = link_group_id
  ) then
    raise exception 'Recette d''un autre carnet' using errcode = '22023', hint = 'recipe_other_group';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_recipe_link() from public, anon, authenticated;

create trigger proposals_check_recipe before insert or update of recipe_id on public.proposals
  for each row execute function public.check_recipe_link();
create trigger shopping_items_check_recipe before insert or update of recipe_id on public.shopping_items
  for each row execute function public.check_recipe_link();

-- ─── photos des recettes ─────────────────────────────────
-- Même principe que la photo de profil : bucket privé, JPEG de 1 Mo au plus, liens temporaires.
-- Dossier = le foyer : ses membres envoient, voient et retirent les photos de son carnet.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 1048576, array['image/jpeg']);

-- Le dossier (texte) est-il un foyer dont on est membre ? Comparaison en texte : un nom de
-- dossier invalide ne fait pas planter le cast.
create function public.is_foyer_member_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id::text = folder and public.is_foyer_member(g.id)
  );
$$;

revoke execute on function public.is_foyer_member_folder(text) from public, anon;
grant execute on function public.is_foyer_member_folder(text) to authenticated;

create policy "recipe-photos: envoyées dans le dossier de son foyer"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and public.is_foyer_member_folder((storage.foldername(name))[1])
  );

create policy "recipe-photos: visibles par le foyer"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and public.is_foyer_member_folder((storage.foldername(name))[1])
  );

create policy "recipe-photos: retirées par le foyer"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and public.is_foyer_member_folder((storage.foldername(name))[1])
  );

-- ─── temps réel ──────────────────────────────────────────
-- Le carnet bouge en direct pour tout le foyer, comme la liste de courses.
alter publication supabase_realtime add table public.recipes;
alter publication supabase_realtime add table public.recipe_ingredients;
