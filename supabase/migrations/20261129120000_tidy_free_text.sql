-- Texte libre propre à l'écriture : pas d'espace au début ni à la fin, un seul espace entre
-- les mots. « Noël  à  Soultz » devient « Noël à Soultz » ; et surtout « Pizza  Roma » n'est
-- plus un plat différent de « Pizza Roma » (l'index anti-doublon des propositions ne coupait
-- que les bords). Côté serveur : l'app, la page web des invités et tout futur client y passent.

create function public.tidy_text(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(value, '\s+', ' ', 'g'));
$$;

-- Un trigger pour toutes les tables : les colonnes à nettoyer sont passées en arguments.
-- La ligne passe par jsonb pour viser une colonne par son nom.
create function public.tidy_text_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
  fields jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if fields ->> col is not null then
      fields := jsonb_set(fields, array[col], to_jsonb(public.tidy_text(fields ->> col)));
    end if;
  end loop;
  new := jsonb_populate_record(new, fields);
  return new;
end;
$$;

create trigger tidy_text before insert or update of name, restaurant on public.groups
  for each row execute function public.tidy_text_columns('name', 'restaurant');

create trigger tidy_text before insert or update of name on public.proposals
  for each row execute function public.tidy_text_columns('name');

create trigger tidy_text before insert or update of label, note on public.order_items
  for each row execute function public.tidy_text_columns('label', 'note');

create trigger tidy_text before insert or update of label on public.soiree_contributions
  for each row execute function public.tidy_text_columns('label');

create trigger tidy_text before insert or update of label, quantity on public.shopping_items
  for each row execute function public.tidy_text_columns('label', 'quantity');

create trigger tidy_text before insert or update of display_name on public.profiles
  for each row execute function public.tidy_text_columns('display_name');

-- Les lignes déjà écrites (vérifié avant : aucune proposition ne devient le doublon d'une autre).
-- Commandes, courses, « qui apporte quoi » : rien à reprendre, et leurs verrous refuseraient
-- une mise à jour sur un repas figé.
update public.groups set name = public.tidy_text(name) where name <> public.tidy_text(name);
update public.groups set restaurant = public.tidy_text(restaurant)
  where restaurant <> public.tidy_text(restaurant);
update public.proposals set name = public.tidy_text(name) where name <> public.tidy_text(name);
update public.profiles set display_name = public.tidy_text(display_name)
  where display_name <> public.tidy_text(display_name);
