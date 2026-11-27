-- Recettes de base, lot 2 : textes originaux écrits pour l'app.
-- Généré par scripts/base-recipes-to-sql.ts depuis scripts/base-recipes/lot2.json (la
-- source à modifier) : chaque ligne passe par ingredientFromFields, chaque aliment est relié à
-- Ciqual. Ids fixes : relancer met à jour sans doublon (les copies pointent vers la recette).

-- Poids d'une pièce pour les aliments que ce lot compte (ordres de grandeur de cuisine).
update public.foods f set unit_weight_g = w.grams from (values
  (26043, 150), -- Cabillaud, cru (un dos)
  (36016, 1000) -- Poulet, viande et peau crues (la part mangée d'un poulet de 1,5 kg)
) as w(id, grams) where f.id = w.id;

-- Lasagnes à la bolognaise
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000011', null, 'Lasagnes à la bolognaise', 6, array[
  'Hache finement l''oignon, la carotte et l''ail, et fais-les fondre 8 min dans l''huile à feu doux : c''est la base du goût.',
  'Monte le feu, ajoute le bœuf et laisse-le dorer avant de l''émietter. Verse le coulis, sale, poivre et laisse mijoter au moins 30 min à feu doux, à demi couvert.',
  'Béchamel : fais fondre le beurre, ajoute la farine et remue 1 min sans colorer. Verse le lait petit à petit en fouettant, jusqu''à ce que la sauce nappe la cuillère. Sale, poivre et ajoute la muscade.',
  'Préchauffe le four à 180 °C. Dans un plat, alterne trois fois une couche de sauce à la viande, des feuilles de lasagne et de la béchamel.',
  'Finis par la béchamel et l''emmental. Enfourne 35 min, jusqu''à ce que le dessus soit doré et que ça bouillonne sur les bords. Laisse reposer 10 min avant de couper.'
], array['sans_porc']::public.recipe_diet[], 110, 2, 'Une lasagne se mérite deux fois : au mijotage, puis au repos. 30 min de sauce, c''est le minimum pour que la viande et la tomate se marient. Et 10 min hors du four, c''est ce qui donne des parts nettes au lieu d''une coulée.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000011';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000011', 0, '250 g Feuilles de lasagne', 'Feuilles de lasagne', 250, 'g'::public.ingredient_unit, 9810),
  ('00000000-0000-4000-8000-000000000011', 1, '500 g Bœuf haché', 'Bœuf haché', 500, 'g'::public.ingredient_unit, 6254),
  ('00000000-0000-4000-8000-000000000011', 2, '500 g Coulis de tomate', 'Coulis de tomate', 500, 'g'::public.ingredient_unit, 20260),
  ('00000000-0000-4000-8000-000000000011', 3, '1 Oignon', 'Oignon', 1, null, 20034),
  ('00000000-0000-4000-8000-000000000011', 4, '1 Carotte', 'Carotte', 1, null, 20009),
  ('00000000-0000-4000-8000-000000000011', 5, '2 Gousses d''ail', 'Gousses d''ail', 2, null, 11000),
  ('00000000-0000-4000-8000-000000000011', 6, '2 c. à soupe Huile d''olive', 'Huile d''olive', 2, 'cuillere_soupe'::public.ingredient_unit, 17270),
  ('00000000-0000-4000-8000-000000000011', 7, '50 g Beurre', 'Beurre', 50, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000011', 8, '50 g Farine', 'Farine', 50, 'g'::public.ingredient_unit, 9435),
  ('00000000-0000-4000-8000-000000000011', 9, '60 cl Lait', 'Lait', 60, 'cl'::public.ingredient_unit, 19041),
  ('00000000-0000-4000-8000-000000000011', 10, '1 pincée Muscade', 'Muscade', 1, 'pincee'::public.ingredient_unit, 11048),
  ('00000000-0000-4000-8000-000000000011', 11, '100 g Emmental râpé', 'Emmental râpé', 100, 'g'::public.ingredient_unit, 12118),
  ('00000000-0000-4000-8000-000000000011', 12, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000011', 13, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Quiche poireaux et chèvre
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000012', null, 'Quiche poireaux et chèvre', 6, array[
  'Préchauffe le four à 180 °C. Étale la pâte dans un moule et pique-la à la fourchette. Couvre-la de papier cuisson et de légumes secs, et cuis-la 15 min à blanc.',
  'Pendant ce temps, lave les poireaux, coupe-les en fines rondelles et fais-les fondre 10 min dans le beurre à feu doux, avec une pincée de sel, jusqu''à ce qu''il ne reste plus d''eau dans la poêle.',
  'Bats les œufs avec la crème et le lait. Poivre et ajoute un peu de muscade.',
  'Retire le papier et les légumes secs. Répartis les poireaux sur la pâte, puis le chèvre en rondelles, et verse les œufs battus.',
  'Cuis 30 min, jusqu''à ce que la quiche soit dorée et à peine tremblante au centre. Attends 10 min avant de la découper.'
], array['vegetarien', 'sans_porc']::public.recipe_diet[], 70, 1, 'Un fond croustillant se gagne avant la garniture. Cuire la pâte à blanc la saisit, et des poireaux bien fondus, sans eau, ne la détrempent pas. Sors la quiche quand le centre tremble encore un peu : elle finit de prendre en tiédissant.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000012';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000012', 0, '1 Pâte brisée', 'Pâte brisée', 1, null, 23414),
  ('00000000-0000-4000-8000-000000000012', 1, '3 Poireaux', 'Poireaux', 3, null, 20039),
  ('00000000-0000-4000-8000-000000000012', 2, '150 g Fromage de chèvre (bûche)', 'Fromage de chèvre (bûche)', 150, 'g'::public.ingredient_unit, 12812),
  ('00000000-0000-4000-8000-000000000012', 3, '3 Œufs', 'Œufs', 3, null, 22000),
  ('00000000-0000-4000-8000-000000000012', 4, '20 cl Crème fraîche', 'Crème fraîche', 20, 'cl'::public.ingredient_unit, 19410),
  ('00000000-0000-4000-8000-000000000012', 5, '10 cl Lait', 'Lait', 10, 'cl'::public.ingredient_unit, 19041),
  ('00000000-0000-4000-8000-000000000012', 6, '15 g Beurre', 'Beurre', 15, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000012', 7, '1 pincée Muscade', 'Muscade', 1, 'pincee'::public.ingredient_unit, 11048),
  ('00000000-0000-4000-8000-000000000012', 8, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000012', 9, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Chili sin carne
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000013', null, 'Chili sin carne', 4, array[
  'Cuis le riz selon le paquet.',
  'Émince l''oignon, coupe le poivron en dés et hache l''ail. Fais-les revenir 6 à 8 min dans l''huile, jusqu''à ce que l''oignon commence à dorer.',
  'Ajoute le cumin, le paprika et le piment, et remue 1 min dans l''huile pour réveiller les épices.',
  'Verse les tomates, les haricots rouges rincés et le maïs. Sale et laisse mijoter 20 min à feu doux en remuant de temps en temps. Écrase quelques haricots contre la paroi pour lier la sauce.',
  'Goûte, ajuste le piment et sers avec le riz.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 45, 1, 'Sans viande, un chili a besoin de profondeur. Les épices grillées dans l''huile en donnent, les haricots écrasés donnent du moelleux. Comme tous les plats mijotés, il est encore meilleur le lendemain.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000013';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000013', 0, '500 g Haricots rouges en conserve (égouttés)', 'Haricots rouges en conserve (égouttés)', 500, 'g'::public.ingredient_unit, 20524),
  ('00000000-0000-4000-8000-000000000013', 1, '150 g Maïs doux en conserve (égoutté)', 'Maïs doux en conserve (égoutté)', 150, 'g'::public.ingredient_unit, 20066),
  ('00000000-0000-4000-8000-000000000013', 2, '400 g Tomates concassées', 'Tomates concassées', 400, 'g'::public.ingredient_unit, 20137),
  ('00000000-0000-4000-8000-000000000013', 3, '1 Oignon', 'Oignon', 1, null, 20034),
  ('00000000-0000-4000-8000-000000000013', 4, '1 Poivron rouge', 'Poivron rouge', 1, null, 20087),
  ('00000000-0000-4000-8000-000000000013', 5, '2 Gousses d''ail', 'Gousses d''ail', 2, null, 11000),
  ('00000000-0000-4000-8000-000000000013', 6, '1 c. à café Cumin', 'Cumin', 1, 'cuillere_cafe'::public.ingredient_unit, 11042),
  ('00000000-0000-4000-8000-000000000013', 7, '1 c. à café Paprika', 'Paprika', 1, 'cuillere_cafe'::public.ingredient_unit, 11049),
  ('00000000-0000-4000-8000-000000000013', 8, '1 pincée Piment de Cayenne', 'Piment de Cayenne', 1, 'pincee'::public.ingredient_unit, 11088),
  ('00000000-0000-4000-8000-000000000013', 9, '1 c. à soupe Huile d''olive', 'Huile d''olive', 1, 'cuillere_soupe'::public.ingredient_unit, 17270),
  ('00000000-0000-4000-8000-000000000013', 10, '250 g Riz', 'Riz', 250, 'g'::public.ingredient_unit, 9100),
  ('00000000-0000-4000-8000-000000000013', 11, 'au goût Sel', 'Sel (au goût)', null, null, 11017);

-- Poulet rôti et pommes de terre
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000014', null, 'Poulet rôti et pommes de terre', 4, array[
  'Si tu peux, sale le poulet quelques heures avant, ou la veille, et laisse-le à découvert au réfrigérateur : la peau sèche et sera plus croustillante. Sors-le 30 min avant de le cuire.',
  'Préchauffe le four à 200 °C. Épluche les pommes de terre, coupe-les en gros morceaux et mets-les dans un grand plat avec l''ail en chemise, le thym, 2 c. à soupe d''huile, du sel et du poivre.',
  'Sèche bien le poulet avec du papier absorbant, pose-le au centre, badigeonne-le du reste de l''huile et poivre-le.',
  'Enfourne 1 h 15, en l''arrosant de son jus toutes les 20 min et en retournant les pommes de terre une fois.',
  'Il est cuit quand le jus qui coule de la cuisse est clair, ou à 74 °C à cœur au thermomètre. Laisse-le reposer 10 min sous une feuille d''aluminium avant de le découper.'
], array['sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 100, 2, 'La peau croustillante se prépare à l''avance. Le sel posé tôt tire l''eau de la peau, et une peau sèche dore au lieu de bouillir. Le repos de 10 min, lui, garde le jus dans la chair au lieu de le laisser couler sur la planche.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000014';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000014', 0, '1 Poulet entier (1,5 kg)', 'Poulet entier (1,5 kg)', 1, null, 36016),
  ('00000000-0000-4000-8000-000000000014', 1, '1 kg Pommes de terre', 'Pommes de terre', 1, 'kg'::public.ingredient_unit, 4008),
  ('00000000-0000-4000-8000-000000000014', 2, '6 Gousses d''ail', 'Gousses d''ail', 6, null, 11000),
  ('00000000-0000-4000-8000-000000000014', 3, 'quelques branches Thym', 'Thym (quelques branches)', null, null, 11070),
  ('00000000-0000-4000-8000-000000000014', 4, '3 c. à soupe Huile d''olive', 'Huile d''olive', 3, 'cuillere_soupe'::public.ingredient_unit, 17270),
  ('00000000-0000-4000-8000-000000000014', 5, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000014', 6, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Velouté de potiron
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000015', null, 'Velouté de potiron', 4, array[
  'Épluche le potiron et les pommes de terre, et coupe-les en cubes. Émince l''oignon.',
  'Fais fondre l''oignon 3 min dans l''huile, ajoute les légumes et laisse-les colorer légèrement 5 min en remuant.',
  'Couvre avec le bouillon et cuis 25 min à petits bouillons, jusqu''à ce que les légumes s''écrasent à la fourchette.',
  'Mixe longuement, 1 à 2 min, jusqu''à ce que ce soit bien lisse. Ajoute le lait de coco, sale, poivre et râpe un peu de muscade. Rallonge d''eau si c''est trop épais.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 40, 1, 'Le goût se construit avant le bouillon. Quelques minutes de coloration dans l''huile donnent des notes caramélisées qu''aucune épice ne remplace. Pour aller plus loin, rôtis le potiron 30 min au four à 220 °C avant de le mixer.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000015';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000015', 0, '1 kg Potiron (épluché)', 'Potiron (épluché)', 1, 'kg'::public.ingredient_unit, 20044),
  ('00000000-0000-4000-8000-000000000015', 1, '300 g Pommes de terre', 'Pommes de terre', 300, 'g'::public.ingredient_unit, 4008),
  ('00000000-0000-4000-8000-000000000015', 2, '1 Oignon', 'Oignon', 1, null, 20034),
  ('00000000-0000-4000-8000-000000000015', 3, '1 l Bouillon de légumes', 'Bouillon de légumes', 1, 'l'::public.ingredient_unit, 25948),
  ('00000000-0000-4000-8000-000000000015', 4, '10 cl Lait de coco', 'Lait de coco', 10, 'cl'::public.ingredient_unit, 18041),
  ('00000000-0000-4000-8000-000000000015', 5, '1 c. à soupe Huile d''olive', 'Huile d''olive', 1, 'cuillere_soupe'::public.ingredient_unit, 17270),
  ('00000000-0000-4000-8000-000000000015', 6, '1 pincée Muscade', 'Muscade', 1, 'pincee'::public.ingredient_unit, 11048),
  ('00000000-0000-4000-8000-000000000015', 7, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000015', 8, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Salade de lentilles
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000016', null, 'Salade de lentilles', 4, array[
  'Rince les lentilles et mets-les dans trois fois leur volume d''eau froide. Cuis-les 20 à 25 min à petits frémissements : elles doivent rester un peu fermes. Sale à la fin et égoutte.',
  'Pendant ce temps, cisèle l''échalote et mets-la dans le vinaigre avec une pincée de sel. Épluche les carottes, coupe-les en petits dés et cisèle le persil.',
  'Ajoute la moutarde au vinaigre, puis l''huile en fouettant, et poivre.',
  'Verse les lentilles encore tièdes dans la vinaigrette, avec les carottes et le persil, et mélange. Sers tiède ou froid.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 35, 1, 'Le vinaigre apprivoise l''échalote. Dix minutes dans l''acide et elle perd son piquant pour devenir douce et parfumée. Et des lentilles encore tièdes boivent la vinaigrette jusqu''au cœur.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000016';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000016', 0, '250 g Lentilles vertes', 'Lentilles vertes', 250, 'g'::public.ingredient_unit, 20585),
  ('00000000-0000-4000-8000-000000000016', 1, '2 Carottes', 'Carottes', 2, null, 20009),
  ('00000000-0000-4000-8000-000000000016', 2, '1 Échalote', 'Échalote', 1, null, 20097),
  ('00000000-0000-4000-8000-000000000016', 3, 'quelques brins Persil', 'Persil (quelques brins)', null, null, 11014),
  ('00000000-0000-4000-8000-000000000016', 4, '1 c. à soupe Moutarde', 'Moutarde', 1, 'cuillere_soupe'::public.ingredient_unit, 11013),
  ('00000000-0000-4000-8000-000000000016', 5, '2 c. à soupe Vinaigre de vin', 'Vinaigre de vin', 2, 'cuillere_soupe'::public.ingredient_unit, 11220),
  ('00000000-0000-4000-8000-000000000016', 6, '4 c. à soupe Huile', 'Huile', 4, 'cuillere_soupe'::public.ingredient_unit, 17440),
  ('00000000-0000-4000-8000-000000000016', 7, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000016', 8, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Pâtes au pesto et tomates cerises
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000017', null, 'Pâtes au pesto et tomates cerises', 4, array[
  'Mets une grande casserole d''eau salée à bouillir et cuis les pâtes selon le paquet.',
  'Fais griller les pignons 2 min à sec dans une poêle, jusqu''à ce qu''ils sentent bon, puis laisse-les refroidir.',
  'Mixe le basilic, l''ail, les pignons, le parmesan et l''huile par petites impulsions, avec un glaçon, juste assez pour une sauce encore un peu granuleuse. Sale.',
  'Coupe les tomates cerises en deux.',
  'Égoutte les pâtes en gardant un peu d''eau de cuisson. Mélange-les au pesto hors du feu avec 2 ou 3 c. à soupe d''eau de cuisson, ajoute les tomates et sers aussitôt.'
], array['vegetarien', 'sans_porc']::public.recipe_diet[], 20, 1, 'Le basilic déteste la chaleur. Un mixeur qui tourne longtemps le chauffe et le fait noircir : des impulsions courtes et un glaçon gardent le pesto bien vert. Et jamais sur le feu, la chaleur des pâtes suffit.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000017';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000017', 0, '400 g Pâtes (penne ou fusilli)', 'Pâtes (penne ou fusilli)', 400, 'g'::public.ingredient_unit, 9810),
  ('00000000-0000-4000-8000-000000000017', 1, '50 g Basilic frais', 'Basilic frais', 50, 'g'::public.ingredient_unit, 11033),
  ('00000000-0000-4000-8000-000000000017', 2, '30 g Pignons de pin', 'Pignons de pin', 30, 'g'::public.ingredient_unit, 15025),
  ('00000000-0000-4000-8000-000000000017', 3, '50 g Parmesan râpé', 'Parmesan râpé', 50, 'g'::public.ingredient_unit, 12120),
  ('00000000-0000-4000-8000-000000000017', 4, '1 Gousse d''ail', 'Gousse d''ail', 1, null, 11000),
  ('00000000-0000-4000-8000-000000000017', 5, '10 cl Huile d''olive', 'Huile d''olive', 10, 'cl'::public.ingredient_unit, 17270),
  ('00000000-0000-4000-8000-000000000017', 6, '250 g Tomates cerises', 'Tomates cerises', 250, 'g'::public.ingredient_unit, 20172),
  ('00000000-0000-4000-8000-000000000017', 7, 'au goût Sel', 'Sel (au goût)', null, null, 11017);

-- Wok de nouilles, légumes et tofu
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000018', null, 'Wok de nouilles, légumes et tofu', 4, array[
  'Cuis les nouilles selon le paquet, égoutte-les et passe-les sous l''eau froide pour qu''elles ne collent pas.',
  'Coupe le tofu en cubes et sèche-le bien dans un torchon. Fais-le dorer 8 min dans la moitié de l''huile, à feu vif, sans trop le remuer, puis réserve-le.',
  'Coupe le poivron en lanières, les carottes en bâtonnets et le brocoli en petits bouquets. Hache l''ail et râpe le gingembre : au wok, tout va très vite, alors tout doit être prêt avant.',
  'Chauffe le reste de l''huile jusqu''à ce qu''elle fume légèrement et fais sauter les légumes 4 à 5 min à feu vif, avec l''ail et le gingembre : ils doivent rester croquants.',
  'Ajoute les nouilles, le tofu et la sauce soja, mélange 2 min sur le feu et parsème de sésame.'
], array['vegan', 'vegetarien', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 30, 2, 'Au wok, la chaleur et l''espace comptent plus que la recette. Trop de légumes d''un coup et ils cuisent à la vapeur au lieu de saisir : fais-les en deux fois si besoin. Un tofu bien sec dore, un tofu humide bout.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000018';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000018', 0, '250 g Nouilles de blé (sans œuf)', 'Nouilles de blé (sans œuf)', 250, 'g'::public.ingredient_unit, 9810),
  ('00000000-0000-4000-8000-000000000018', 1, '400 g Tofu nature', 'Tofu nature', 400, 'g'::public.ingredient_unit, 20904),
  ('00000000-0000-4000-8000-000000000018', 2, '1 Poivron rouge', 'Poivron rouge', 1, null, 20087),
  ('00000000-0000-4000-8000-000000000018', 3, '2 Carottes', 'Carottes', 2, null, 20009),
  ('00000000-0000-4000-8000-000000000018', 4, '300 g Brocoli', 'Brocoli', 300, 'g'::public.ingredient_unit, 20057),
  ('00000000-0000-4000-8000-000000000018', 5, '2 Gousses d''ail', 'Gousses d''ail', 2, null, 11000),
  ('00000000-0000-4000-8000-000000000018', 6, '1 morceau de 3 cm Gingembre frais', 'Gingembre frais (morceau de 3 cm)', 1, null, 11074),
  ('00000000-0000-4000-8000-000000000018', 7, '4 c. à soupe Sauce soja', 'Sauce soja', 4, 'cuillere_soupe'::public.ingredient_unit, 11104),
  ('00000000-0000-4000-8000-000000000018', 8, '2 c. à soupe Huile', 'Huile', 2, 'cuillere_soupe'::public.ingredient_unit, 17440),
  ('00000000-0000-4000-8000-000000000018', 9, '1 c. à soupe Graines de sésame', 'Graines de sésame', 1, 'cuillere_soupe'::public.ingredient_unit, 15010);

-- Cabillaud en papillote
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000019', null, 'Cabillaud en papillote', 4, array[
  'Préchauffe le four à 200 °C et cuis le riz selon le paquet.',
  'Coupe les courgettes en fines rondelles, les tomates cerises en deux et le citron en rondelles.',
  'Sur 4 grandes feuilles de papier cuisson, répartis les courgettes, pose un dos de cabillaud, puis les tomates, une rondelle de citron et le thym. Sale, poivre et arrose d''huile.',
  'Ferme chaque papillote en repliant les bords plusieurs fois, bien serré, pour garder la vapeur à l''intérieur.',
  'Cuis 15 à 18 min : la papillote gonfle, et le poisson est cuit quand sa chair se détache en lamelles nacrées. Ouvre les papillotes à table.'
], array['sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 35, 2, 'La papillote cuit le poisson dans son propre parfum. Rien ne s''échappe : le citron, le thym et l''huile infusent la chair pendant la cuisson. Ouvre-la devant tout le monde, la vapeur fait le spectacle.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000019';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000019', 0, '4 Dos de cabillaud', 'Dos de cabillaud', 4, null, 26043),
  ('00000000-0000-4000-8000-000000000019', 1, '2 Courgettes', 'Courgettes', 2, null, 20020),
  ('00000000-0000-4000-8000-000000000019', 2, '200 g Tomates cerises', 'Tomates cerises', 200, 'g'::public.ingredient_unit, 20172),
  ('00000000-0000-4000-8000-000000000019', 3, '1 Citron', 'Citron', 1, null, 2028),
  ('00000000-0000-4000-8000-000000000019', 4, 'quelques branches Thym', 'Thym (quelques branches)', null, null, 11070),
  ('00000000-0000-4000-8000-000000000019', 5, '2 c. à soupe Huile d''olive', 'Huile d''olive', 2, 'cuillere_soupe'::public.ingredient_unit, 17270),
  ('00000000-0000-4000-8000-000000000019', 6, '250 g Riz basmati', 'Riz basmati', 250, 'g'::public.ingredient_unit, 9119),
  ('00000000-0000-4000-8000-000000000019', 7, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000019', 8, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Gâteau au chocolat
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000020', null, 'Gâteau au chocolat', 8, array[
  'Préchauffe le four à 180 °C et beurre un moule d''environ 22 cm.',
  'Fais fondre le chocolat et le beurre ensemble, doucement, au bain-marie ou au micro-ondes par tranches de 30 s en remuant.',
  'Hors du feu, ajoute le sucre, puis les œufs un à un en mélangeant bien entre chaque.',
  'Ajoute la farine et le sel, et mélange juste assez pour qu''il ne reste plus de traces de farine.',
  'Verse dans le moule et cuis 20 à 25 min : la lame d''un couteau doit ressortir avec quelques miettes humides. Laisse tiédir avant de démouler.'
], array['vegetarien', 'sans_porc']::public.recipe_diet[], 40, 1, 'Sors le fondant quand tu as l''impression qu''il lui manque 2 minutes : il finit de cuire et se raffermit en refroidissant. La pincée de sel n''est pas une erreur, elle fait ressortir le goût du chocolat.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000020';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000020', 0, '200 g Chocolat noir à pâtisser', 'Chocolat noir à pâtisser', 200, 'g'::public.ingredient_unit, 31085),
  ('00000000-0000-4000-8000-000000000020', 1, '150 g Beurre', 'Beurre', 150, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000020', 2, '120 g Sucre', 'Sucre', 120, 'g'::public.ingredient_unit, 31016),
  ('00000000-0000-4000-8000-000000000020', 3, '4 Œufs', 'Œufs', 4, null, 22000),
  ('00000000-0000-4000-8000-000000000020', 4, '50 g Farine', 'Farine', 50, 'g'::public.ingredient_unit, 9435),
  ('00000000-0000-4000-8000-000000000020', 5, '1 pincée Sel', 'Sel', 1, 'pincee'::public.ingredient_unit, 11017);
