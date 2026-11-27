-- Photos des recettes de base, lot 1 (le dossier base/ vient de la migration base_recipe_photos).
-- Les fichiers sont envoyés AVANT cette migration, avec la clé service_role :
--   npx supabase storage cp --experimental --linked <photo>.jpg ss:///recipe-photos/base/<id>.jpg
-- Recadrées en 4:3, 1200 × 900, JPEG 75 (le format des photos de recette de l'app).
--
-- Seulement des photos CC0 ou du domaine public, vérifiées une par une le 2026-11-27 (licence,
-- « travail personnel » de l'auteur, aucun logo, enseigne ni visage). Aucune mention n'est
-- exigée ; la source reste notée ici pour pouvoir la retrouver.
--   01 Pâtes carbonara        Spaghetti alla Carbonara.jpg, Mattes Boch, domaine public
--   02 Omelette               FoodOmelete.jpg, Renee Comet (National Cancer Institute), domaine public
--   03 Poulet curry coco      Yellow curry with coconut, chicken… - San Francisco, CA.jpg, Daderot, CC0
--   04 Saumon, riz, brocoli   Steckenroth, salmon on baked vegetables.jpg, Gerda Arendt, CC0
--   05 Hachis parmentier      Hachis Parmentier - Boston, MA.jpg, Daderot, CC0
--   06 Blanquette de veau     pas de photo : aucune sans nom de restaurant visible
--   07 Ratatouille            Ratatouille-Dish.jpg, Benoit5656, domaine public
--   08 Dahl lentilles corail  Lal Masoor Dal and Palak.JPG, Miansari66, CC0
--   09 Curry pois chiches     Chana Masala - Mohammed - Spice Of Life 2024-05-27.jpg, Andy Li, CC0
--   10 Crêpes                 Crêpe au sucre au Bouchon breton (octobre 2021).jpg, Benoît Prieur, CC0
-- Pages : https://commons.wikimedia.org/wiki/File:<nom du fichier>

update public.recipes
set photo_path = 'base/' || id::text || '.jpg'
where group_id is null
  and id in (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000008',
    '00000000-0000-4000-8000-000000000009',
    '00000000-0000-4000-8000-000000000010'
  );

-- Les copies faites avant les photos les reçoivent aussi. Une copie qui a déjà sa propre photo
-- la garde.
update public.recipes copy
set photo_path = base.photo_path
from public.recipes base
where copy.source_recipe_id = base.id
  and base.group_id is null
  and base.photo_path is not null
  and copy.photo_path is null;
