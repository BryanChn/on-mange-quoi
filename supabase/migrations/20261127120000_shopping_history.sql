-- Liste de courses : « Rajouter en un toucher » (décidé le 2026-11-24). « Retirer les
-- achetés » ne supprime plus les articles cochés : il les range (cleared_at). Les articles
-- rangés alimentent les suggestions (« Lait · 2 », « Pain ») qu'un toucher remet dans la
-- liste. La croix d'un article, elle, supprime vraiment (une erreur n'a pas à revenir).

alter table public.shopping_items
  add column cleared_at timestamptz,
  -- Seul un article pris (coché) peut être rangé.
  add constraint shopping_items_cleared_needs_checked
    check (cleared_at is null or checked_at is not null);

-- La liste affichée : les articles non rangés d'un foyer.
create index shopping_items_open_idx on public.shopping_items (group_id) where cleared_at is null;

-- L'app range en envoyant une date ; l'heure réelle vient du serveur (trigger).
grant update (cleared_at) on public.shopping_items to authenticated;

-- Même trigger qu'avant (heure et auteur d'une coche posés par le serveur), plus le
-- rangement : l'heure vient du serveur, et un article rangé garde sa première date.
create or replace function public.stamp_shopping_item_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.checked_at is null then
    new.checked_by := null;
  elsif old.checked_at is null then
    new.checked_at := now();
    new.checked_by := auth.uid();
  else
    new.checked_at := old.checked_at;
    new.checked_by := old.checked_by;
  end if;

  if new.cleared_at is not null and old.cleared_at is null then
    new.cleared_at := now();
  elsif new.cleared_at is not null then
    new.cleared_at := old.cleared_at;
  end if;

  return new;
end;
$$;
