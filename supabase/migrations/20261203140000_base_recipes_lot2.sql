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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000011', null, 'Lasagnes à la bolognaise', 6, array[
  'Hacher l''oignon, la carotte et l''ail. Les faire revenir 5 min dans l''huile.',
  'Ajouter le bœuf et le faire dorer en l''émiettant. Verser le coulis, saler, poivrer et laisser mijoter 20 min à feu doux.',
  'Béchamel : faire fondre le beurre, ajouter la farine et remuer 1 min. Verser le lait petit à petit en fouettant, jusqu''à ce que la sauce épaississe. Saler, poivrer, ajouter la muscade.',
  'Préchauffer le four à 180 °C. Dans un plat, alterner trois fois une couche de sauce à la viande, des feuilles de lasagne et de la béchamel.',
  'Finir par la béchamel et l''emmental. Cuire 35 min, jusqu''à ce que le dessus soit doré, puis laisser reposer 5 min avant de servir.'
], array['sans_porc']::public.recipe_diet[], 100, 2)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000012', null, 'Quiche poireaux et chèvre', 6, array[
  'Préchauffer le four à 180 °C. Étaler la pâte dans un moule et la piquer à la fourchette.',
  'Laver les poireaux, les couper en fines rondelles et les faire fondre 10 min dans le beurre, à feu doux, avec un peu de sel.',
  'Battre les œufs avec la crème et le lait. Poivrer et ajouter un peu de muscade.',
  'Répartir les poireaux sur la pâte, puis le chèvre en rondelles, et verser les œufs battus par-dessus.',
  'Cuire 35 min, jusqu''à ce que la quiche soit dorée et prise au centre.'
], array['vegetarien', 'sans_porc']::public.recipe_diet[], 60, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000013', null, 'Chili sin carne', 4, array[
  'Cuire le riz selon le paquet.',
  'Émincer l''oignon, couper le poivron en dés et hacher l''ail. Les faire revenir 5 min dans l''huile.',
  'Ajouter le cumin, le paprika et le piment, et remuer 1 min pour réveiller les épices.',
  'Verser les tomates, les haricots rouges rincés et le maïs. Saler et laisser mijoter 20 min à feu doux, en remuant de temps en temps.',
  'Goûter, ajuster le piment et servir avec le riz.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 45, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000014', null, 'Poulet rôti et pommes de terre', 4, array[
  'Préchauffer le four à 200 °C. Si possible, sortir le poulet du réfrigérateur 30 min avant.',
  'Éplucher les pommes de terre, les couper en gros morceaux et les mettre dans un grand plat avec l''ail en chemise, le thym, 2 c. à soupe d''huile, du sel et du poivre.',
  'Poser le poulet au centre, le badigeonner avec le reste de l''huile, saler et poivrer.',
  'Enfourner 1 h 15, en arrosant le poulet de son jus toutes les 20 min et en retournant les pommes de terre une fois.',
  'Le poulet est cuit quand le jus qui coule de la cuisse est clair. Le laisser reposer 10 min sous une feuille d''aluminium avant de le découper.'
], array['sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 100, 2)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000015', null, 'Velouté de potiron', 4, array[
  'Éplucher le potiron et les pommes de terre, les couper en cubes. Émincer l''oignon.',
  'Faire revenir l''oignon 3 min dans l''huile, ajouter les légumes et remuer 2 min.',
  'Couvrir avec le bouillon et cuire 25 min à petits bouillons, jusqu''à ce que les légumes s''écrasent à la fourchette.',
  'Mixer finement, ajouter le lait de coco, saler, poivrer et ajouter un peu de muscade. Rallonger d''eau si le velouté est trop épais.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 40, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000016', null, 'Salade de lentilles', 4, array[
  'Rincer les lentilles et les cuire 20 à 25 min dans trois fois leur volume d''eau froide, sans sel : elles doivent rester un peu fermes. Saler en fin de cuisson et égoutter.',
  'Pendant ce temps, éplucher les carottes et les couper en petits dés. Ciseler l''échalote et le persil.',
  'Dans un saladier, mélanger la moutarde et le vinaigre, puis ajouter l''huile, du sel et du poivre.',
  'Ajouter les lentilles encore tièdes, les carottes, l''échalote et le persil, et mélanger. Tièdes, les lentilles prennent mieux la sauce.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 35, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000017', null, 'Pâtes au pesto et tomates cerises', 4, array[
  'Cuire les pâtes dans une grande casserole d''eau salée, selon le temps du paquet.',
  'Pesto : faire griller les pignons 2 min à sec dans une poêle. Les mixer avec le basilic, l''ail, le parmesan et l''huile, jusqu''à obtenir une sauce épaisse. Saler.',
  'Couper les tomates cerises en deux.',
  'Égoutter les pâtes en gardant un peu d''eau de cuisson. Les mélanger au pesto hors du feu, avec 2 ou 3 c. à soupe d''eau de cuisson pour le rendre onctueux.',
  'Ajouter les tomates et servir aussitôt.'
], array['vegetarien', 'sans_porc']::public.recipe_diet[], 20, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000018', null, 'Wok de nouilles, légumes et tofu', 4, array[
  'Cuire les nouilles selon le paquet, les égoutter et les passer sous l''eau froide pour qu''elles ne collent pas.',
  'Couper le tofu en cubes, le sécher dans un torchon et le faire dorer 8 min dans la moitié de l''huile, à feu vif. Réserver.',
  'Couper le poivron en lanières, les carottes en bâtonnets et le brocoli en petits bouquets. Hacher l''ail et râper le gingembre.',
  'Faire sauter les légumes 5 min à feu vif dans le reste de l''huile, avec l''ail et le gingembre : ils doivent rester croquants.',
  'Ajouter les nouilles, le tofu et la sauce soja, mélanger 2 min sur le feu et parsemer de sésame.'
], array['vegan', 'vegetarien', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 30, 2)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000019', null, 'Cabillaud en papillote', 4, array[
  'Préchauffer le four à 200 °C et cuire le riz selon le paquet.',
  'Couper les courgettes en fines rondelles, les tomates cerises en deux et le citron en rondelles.',
  'Sur 4 grandes feuilles de papier cuisson, répartir les courgettes, poser un dos de cabillaud, puis les tomates, une rondelle de citron et le thym. Saler, poivrer et arroser d''huile.',
  'Fermer chaque papillote en repliant les bords plusieurs fois, pour garder la vapeur à l''intérieur.',
  'Cuire 15 à 18 min : le poisson est cuit quand sa chair se détache en lamelles. Servir avec le riz et ouvrir les papillotes à table.'
], array['sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 35, 2)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000020', null, 'Gâteau au chocolat', 8, array[
  'Préchauffer le four à 180 °C et beurrer un moule d''environ 22 cm.',
  'Faire fondre le chocolat et le beurre ensemble, au bain-marie ou 1 min au micro-ondes en remuant à mi-cuisson.',
  'Hors du feu, ajouter le sucre, puis les œufs un à un en mélangeant bien entre chaque.',
  'Incorporer la farine et le sel sans trop travailler la pâte.',
  'Verser dans le moule et cuire 20 à 25 min : le centre doit rester un peu tremblant. Laisser tiédir avant de démouler.'
], array['vegetarien', 'sans_porc']::public.recipe_diet[], 40, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000020';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000020', 0, '200 g Chocolat noir à pâtisser', 'Chocolat noir à pâtisser', 200, 'g'::public.ingredient_unit, 31085),
  ('00000000-0000-4000-8000-000000000020', 1, '150 g Beurre', 'Beurre', 150, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000020', 2, '120 g Sucre', 'Sucre', 120, 'g'::public.ingredient_unit, 31016),
  ('00000000-0000-4000-8000-000000000020', 3, '4 Œufs', 'Œufs', 4, null, 22000),
  ('00000000-0000-4000-8000-000000000020', 4, '50 g Farine', 'Farine', 50, 'g'::public.ingredient_unit, 9435),
  ('00000000-0000-4000-8000-000000000020', 5, '1 pincée Sel', 'Sel', 1, 'pincee'::public.ingredient_unit, 11017);
