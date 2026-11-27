-- La liste de courses rangée par rayon (2026-11-27, entrée en V1 : maquette
-- https://claude.ai/artifact/3PSCG8xwP2TxWtpr9VSQ9a). Chaque article a un rayon, deviné par
-- l'app d'après son nom ; le foyer peut le changer, et l'app s'en souvient pour ce nom
-- (comme Rappels sur iPhone). Une étoile marque les indispensables. L'ordre des rayons suit le
-- magasin du foyer, partagé par tous ses membres.

-- Liste fermée : un tri fiable, des libellés traduits dans l'app. « autres » reste en dernier.
create type public.shopping_aisle as enum (
  'fruits_legumes', 'boucherie_poisson', 'cremerie', 'boulangerie', 'epicerie_salee',
  'epicerie_sucree', 'surgeles', 'boissons', 'bebe', 'animaux', 'maison_hygiene', 'autres'
);

-- Les articles déjà dans les listes vont dans « autres » : le foyer les range s'il le souhaite.
alter table public.shopping_items
  add column aisle public.shopping_aisle not null default 'autres',
  add column is_important boolean not null default false;

grant insert (aisle, is_important) on public.shopping_items to authenticated;
grant update (is_important) on public.shopping_items to authenticated;

-- ─── les rayons choisis par le foyer, retenus par nom d'article ──
-- label_key : le nom normalisé par l'app (minuscules, sans accents), comme pour les doublons.
create table public.shopping_aisle_choices (
  group_id   uuid not null references public.groups (id) on delete cascade,
  label_key  varchar(80) not null check (length(trim(label_key)) > 0),
  aisle      public.shopping_aisle not null,
  updated_at timestamptz not null default now(),
  primary key (group_id, label_key)
);

alter table public.shopping_aisle_choices enable row level security;

-- Lecture par les membres du foyer ; écriture seulement par set_shopping_item_aisle.
revoke all on public.shopping_aisle_choices from anon, authenticated;
grant select on public.shopping_aisle_choices to authenticated;

create policy "shopping_aisle_choices: visibles par les membres du foyer"
  on public.shopping_aisle_choices for select
  to authenticated
  using (public.is_foyer_member(group_id));

-- ─── l'ordre des rayons du foyer ─────────────────────────
-- null = l'ordre par défaut de l'app. Lisible avec le groupe ; écrit par set_aisle_order.
alter table public.groups add column aisle_order public.shopping_aisle[];

-- Changer le rayon d'un article et s'en souvenir pour ce nom, dans le foyer de l'article.
create function public.set_shopping_item_aisle(
  target_item_id uuid,
  new_aisle public.shopping_aisle,
  item_label_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_group_id uuid;
begin
  select group_id into item_group_id from public.shopping_items where id = target_item_id;
  if item_group_id is null or not public.is_foyer_member(item_group_id) then
    raise exception 'Article introuvable' using errcode = '42501', hint = 'item_not_found';
  end if;
  if item_label_key is null or length(trim(item_label_key)) = 0 or length(item_label_key) > 80 then
    raise exception 'Nom invalide' using errcode = '22023', hint = 'invalid_label_key';
  end if;

  update public.shopping_items set aisle = new_aisle where id = target_item_id;

  insert into public.shopping_aisle_choices (group_id, label_key, aisle)
  values (item_group_id, item_label_key, new_aisle)
  on conflict (group_id, label_key)
  do update set aisle = excluded.aisle, updated_at = now();
end;
$$;

revoke execute on function public.set_shopping_item_aisle(uuid, public.shopping_aisle, text)
  from public, anon;
grant execute on function public.set_shopping_item_aisle(uuid, public.shopping_aisle, text)
  to authenticated;

-- L'ordre des rayons du foyer : tous les rayons, chacun une fois, « autres » en dernier.
create function public.set_aisle_order(
  target_group_id uuid,
  new_order public.shopping_aisle[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_foyer_member(target_group_id) then
    raise exception 'Foyer introuvable' using errcode = '42501', hint = 'not_member';
  end if;
  if new_order is null
    or cardinality(new_order) <> cardinality(enum_range(null::public.shopping_aisle))
    or (select count(distinct aisle) from unnest(new_order) as aisle) <> cardinality(new_order)
    or new_order[cardinality(new_order)] <> 'autres'
  then
    raise exception 'Ordre des rayons invalide' using errcode = '22023', hint = 'invalid_order';
  end if;

  update public.groups set aisle_order = new_order where id = target_group_id;
end;
$$;

revoke execute on function public.set_aisle_order(uuid, public.shopping_aisle[]) from public, anon;
grant execute on function public.set_aisle_order(uuid, public.shopping_aisle[]) to authenticated;
