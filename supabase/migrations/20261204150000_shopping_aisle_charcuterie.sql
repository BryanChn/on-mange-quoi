-- Un 13e rayon, « Charcuterie et traiteur » (2026-11-27) : les enseignes le séparent de la
-- boucherie (jambon, lardons, pâte feuilletée, pâtes fraîches, houmous…). Seul dans sa
-- migration : une valeur ajoutée à un enum n'est utilisable qu'une fois la transaction validée
-- (le rangement des articles existants vient dans la migration suivante).
alter type public.shopping_aisle add value 'charcuterie_traiteur' after 'boucherie_poisson';
