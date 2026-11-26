-- Recherche d'un aliment Ciqual pour l'autocomplétion des ingrédients : sans accents ni
-- majuscules (« creme » trouve « Crème fraîche », « oeuf » trouve « Œuf »), rapide sur 3 484
-- aliments grâce à un index trigramme.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Le texte comparé : minuscules, sans accents. immutable (le dictionnaire est nommé) : un index
-- peut s'en servir.
create function public.food_search_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, value));
$$;

create index foods_search_idx
  on public.foods using gin (public.food_search_text(name) extensions.gin_trgm_ops);

-- Les 8 aliments dont le nom contient ce qu'on tape (2 lettres au moins) : ceux qui commencent
-- par le texte d'abord, puis les noms les plus courts (« Carotte, crue » avant « Carotte, cuite,
-- en conserve »). Les % et _ tapés sont du texte, pas des jokers. security invoker : la RLS de
-- foods s'applique (comptes réels seulement, jamais un invité anonyme).
create function public.search_foods(query text)
returns table (id integer, name varchar, group_name varchar)
language sql
stable
set search_path = ''
as $$
  with typed as (
    select replace(replace(replace(public.food_search_text(btrim(query)), '\', '\\'), '%', '\%'), '_', '\_')
      as pattern
  )
  select f.id, f.name, f.group_name
  from public.foods f, typed
  where length(typed.pattern) >= 2
    and public.food_search_text(f.name) like '%' || typed.pattern || '%'
  order by
    (public.food_search_text(f.name) like typed.pattern || '%') desc,
    length(f.name),
    f.name
  limit 8;
$$;

revoke execute on function public.search_foods(text) from public, anon;
grant execute on function public.search_foods(text) to authenticated;
