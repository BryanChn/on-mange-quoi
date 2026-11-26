-- La recherche d'un aliment, mot par mot et classée par pertinence. Premier essai en ligne
-- (26/11) : « oeuf » trouvait « Sang, boeuf, cru » (boeuf contient oeuf), « sel » trouvait
-- « Selles-sur-Cher », et « crème liquide » rien du tout (un seul bloc de texte).

-- Le texte comparé, calculé une fois à l'écriture plutôt qu'à chaque frappe.
alter table public.foods
  add column search_text text generated always as (public.food_search_text(name)) stored;

-- L'index trigramme sur l'expression ne sert plus : la recherche lit search_text (3 484 lignes,
-- un parcours complet reste de l'ordre de la milliseconde).
drop index if exists public.foods_search_idx;

-- Chaque mot tapé doit se trouver dans le nom (« pomme terre » trouve « Pomme de terre »). Puis,
-- dans l'ordre : le plus de mots entiers (« sel » avant « selles »), le nom qui commence par le
-- premier mot, le plus de débuts de mots (« oeuf » avant « boeuf »), le nom le plus court.
-- 2 lettres ou chiffres au moins ; les caractères spéciaux tapés sont du texte, jamais des jokers.
create or replace function public.search_foods(query text)
returns table (id integer, name varchar, group_name varchar)
language sql
stable
set search_path = ''
as $$
  with typed as (
    select public.food_search_text(btrim(query)) as text
  ),
  words as (
    select array_agg(word) as list
    from typed, unnest(regexp_split_to_array(typed.text, '[[:space:],;]+')) as word
    where word <> ''
  ),
  -- Les mots, protégés pour une expression régulière (\m : début de mot, \M : fin de mot).
  patterns as (
    select array_agg(regexp_replace(word, '([^[:alnum:] ])', '\\\1', 'g')) as list
    from unnest((select list from words)) as word
  )
  select f.id, f.name, f.group_name
  from public.foods f, typed, words, patterns
  where length(regexp_replace(typed.text, '[^[:alnum:]]', '', 'g')) >= 2
    and not exists (
      select 1 from unnest(words.list) as word where strpos(f.search_text, word) = 0
    )
  order by
    (select count(*) from unnest(patterns.list) as p where f.search_text ~ ('\m' || p || '\M')) desc,
    (strpos(f.search_text, words.list[1]) = 1) desc,
    (select count(*) from unnest(patterns.list) as p where f.search_text ~ ('\m' || p)) desc,
    length(f.name),
    f.name
  limit 8;
$$;

revoke execute on function public.search_foods(text) from public, anon;
grant execute on function public.search_foods(text) to authenticated;
