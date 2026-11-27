-- Photos des recettes de base, lot 2 (même méthode que base_recipe_photos_lot1).
-- Les fichiers sont envoyés AVANT cette migration, avec la clé service_role :
--   npx supabase storage cp --experimental --linked <photo>.jpg ss:///recipe-photos/base/<id>.jpg
-- Recadrées en 4:3, 1200 × 900, JPEG 75.
--
-- Seulement des photos CC0 ou du domaine public, vérifiées une par une le 2026-11-27 (licence,
-- « travail personnel » de l'auteur, aucun logo, enseigne ni visage, rien qui contredise la
-- recette : pas de viande sur un plat vegan). La source reste notée ici.
--   11 Lasagnes               Préparation des lasagnes (mars 2020) - (018) à table.jpg, Benoît Prieur, CC0
--   12 Quiche poireaux        QUICHE-VERDURAS.jpg, El Caminito, CC0
--   13 Chili sin carne        Vegan chili.jpeg, Miscellaneous contributor, CC0
--   14 Poulet rôti            Poulet roti sorti du four en janvier 2023.jpg, Benoît Prieur, CC0
--   15 Velouté de potiron     pas de photo : la seule trouvée montre du parmesan (recette vegan)
--   16 Salade de lentilles    Salade de lentilles au Bouillon de Lyon en février 2023.jpg, Benoît Prieur, CC0
--   17 Pâtes au pesto         Marienthal, pasta with Bärlauch pesto.jpg, Gerda Arendt, CC0
--   18 Wok de nouilles        pas de photo : toutes les nouilles sautées trouvées ont de la viande
--   19 Cabillaud en papillote pas de photo : aucune sur Commons
--   20 Gâteau au chocolat     Fondant au chocolat fait maison - French Coffee Shop, Dieppe 2026-05-11.jpg, Andy Li, CC0
-- Pages : https://commons.wikimedia.org/wiki/File:<nom du fichier>

update public.recipes
set photo_path = 'base/' || id::text || '.jpg'
where group_id is null
  and id in (
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000012',
    '00000000-0000-4000-8000-000000000013',
    '00000000-0000-4000-8000-000000000014',
    '00000000-0000-4000-8000-000000000016',
    '00000000-0000-4000-8000-000000000017',
    '00000000-0000-4000-8000-000000000020'
  );

-- Les copies faites avant les photos les reçoivent aussi ; une copie qui a sa photo la garde.
update public.recipes copy
set photo_path = base.photo_path
from public.recipes base
where copy.source_recipe_id = base.id
  and base.group_id is null
  and base.photo_path is not null
  and copy.photo_path is null;
