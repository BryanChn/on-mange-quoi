-- Recettes de base, lot 1 (relu le 26/11) : 10 recettes écrites pour l'app, textes originaux.
-- Généré depuis la liste relue : chaque ligne passe par ingredientFromFields (comme tapée dans
-- l'app), chaque aliment est relié à Ciqual. Ids fixes : une recette de base garde son id, la
-- relancer met à jour sans doublon (les copies dans les carnets pointent vers elle).

-- Poids d'une pièce pour les aliments que ce lot compte (ordres de grandeur de cuisine).
update public.foods f set unit_weight_g = w.grams from (values
  (22002, 18), -- Oeuf, jaune, cru (un jaune)
  (11074, 15), -- Gingembre, racine fraîche (un morceau de 3 cm)
  (26036, 130), -- Saumon, élevage, cru (un pavé)
  (20057, 400), -- Brocoli, cru (une tête)
  (2028, 40), -- Jus de citron (le jus d'un citron)
  (20053, 300) -- Aubergine, crue
) as w(id, grams) where f.id = w.id;

-- Pâtes carbonara
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000001', null, 'Pâtes carbonara', 4, array[
  'Porter une grande casserole d''eau salée à ébullition et y cuire les spaghetti en suivant le temps du paquet.',
  'Pendant ce temps, faire dorer les lardons à sec dans une grande poêle, puis couper le feu.',
  'Dans un bol, battre les œufs, les jaunes et le parmesan avec beaucoup de poivre.',
  'Égoutter les pâtes en gardant un verre d''eau de cuisson, puis les verser dans la poêle avec les lardons, feu éteint.',
  'Verser le mélange aux œufs en remuant vite, avec un peu d''eau de cuisson, jusqu''à obtenir une sauce crémeuse. Pas de feu : les œufs ne doivent pas cuire en omelette.'
], '{}', 20, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000001';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000001', 0, '400 g Spaghetti', 'Spaghetti', 400, 'g'::public.ingredient_unit, 9810),
  ('00000000-0000-4000-8000-000000000001', 1, '150 g Lardons fumés (ou guanciale)', 'Lardons fumés (ou guanciale)', 150, 'g'::public.ingredient_unit, 28720),
  ('00000000-0000-4000-8000-000000000001', 2, '3 Œufs', 'Œufs', 3, null, 22000),
  ('00000000-0000-4000-8000-000000000001', 3, '2 Jaunes d''œuf', 'Jaunes d''œuf', 2, null, 22002),
  ('00000000-0000-4000-8000-000000000001', 4, '60 g Parmesan râpé', 'Parmesan râpé', 60, 'g'::public.ingredient_unit, 12120),
  ('00000000-0000-4000-8000-000000000001', 5, 'au goût Poivre noir', 'Poivre noir (au goût)', null, null, 11015),
  ('00000000-0000-4000-8000-000000000001', 6, 'au goût Gros sel pour l''eau', 'Gros sel pour l''eau (au goût)', null, null, null);

-- Omelette aux champignons
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000002', null, 'Omelette aux champignons', 2, array[
  'Nettoyer les champignons et les émincer.',
  'Les faire revenir 5 min dans la moitié du beurre, à feu vif, jusqu''à ce que leur eau soit évaporée. Saler, réserver.',
  'Battre les œufs avec le sel, le poivre et le persil ciselé.',
  'Faire fondre le reste du beurre, verser les œufs et ramener les bords vers le centre pendant 2 min.',
  'Ajouter les champignons sur une moitié, plier l''omelette quand le dessus est encore baveux, servir aussitôt.'
], array['vegetarien', 'sans_gluten']::public.recipe_diet[], 15, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000002';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000002', 0, '5 Œufs', 'Œufs', 5, null, 22000),
  ('00000000-0000-4000-8000-000000000002', 1, '250 g Champignons de Paris', 'Champignons de Paris', 250, 'g'::public.ingredient_unit, 20056),
  ('00000000-0000-4000-8000-000000000002', 2, '20 g Beurre', 'Beurre', 20, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000002', 3, 'quelques brins Persil', 'Persil (quelques brins)', null, null, 11014),
  ('00000000-0000-4000-8000-000000000002', 4, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000002', 5, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Poulet au curry et lait de coco
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000003', null, 'Poulet au curry et lait de coco', 4, array[
  'Rincer le riz et le cuire selon le paquet.',
  'Émincer l''oignon, hacher l''ail et râper le gingembre. Couper le poulet en morceaux.',
  'Faire revenir l''oignon 5 min dans l''huile, ajouter l''ail, le gingembre et le curry, remuer 1 min.',
  'Ajouter le poulet et le faire dorer 5 min sur toutes les faces.',
  'Verser les tomates et le lait de coco, saler, laisser mijoter 15 min à feu doux.',
  'Servir sur le riz, parsemé de coriandre.'
], array['sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 35, 2)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000003';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000003', 0, '600 g Blancs de poulet', 'Blancs de poulet', 600, 'g'::public.ingredient_unit, 36017),
  ('00000000-0000-4000-8000-000000000003', 1, '40 cl Lait de coco', 'Lait de coco', 40, 'cl'::public.ingredient_unit, 18041),
  ('00000000-0000-4000-8000-000000000003', 2, '1 Oignon', 'Oignon', 1, null, 20034),
  ('00000000-0000-4000-8000-000000000003', 3, '2 Gousses d''ail', 'Gousses d''ail', 2, null, 11000),
  ('00000000-0000-4000-8000-000000000003', 4, '1 morceau de 3 cm Gingembre frais', 'Gingembre frais (morceau de 3 cm)', 1, null, 11074),
  ('00000000-0000-4000-8000-000000000003', 5, '2 c. à soupe Curry en poudre', 'Curry en poudre', 2, 'cuillere_soupe'::public.ingredient_unit, 11005),
  ('00000000-0000-4000-8000-000000000003', 6, '200 g Tomates concassées', 'Tomates concassées', 200, 'g'::public.ingredient_unit, 20137),
  ('00000000-0000-4000-8000-000000000003', 7, '1 c. à soupe Huile', 'Huile', 1, 'cuillere_soupe'::public.ingredient_unit, 17440),
  ('00000000-0000-4000-8000-000000000003', 8, '300 g Riz basmati', 'Riz basmati', 300, 'g'::public.ingredient_unit, 9119),
  ('00000000-0000-4000-8000-000000000003', 9, 'quelques brins Coriandre fraîche', 'Coriandre fraîche (quelques brins)', null, null, 11094),
  ('00000000-0000-4000-8000-000000000003', 10, 'au goût Sel', 'Sel (au goût)', null, null, 11017);

-- Saumon, riz et brocoli
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000004', null, 'Saumon, riz et brocoli', 4, array[
  'Cuire le riz selon le paquet.',
  'Détailler le brocoli en petits bouquets et les cuire 6 min à la vapeur ou dans l''eau bouillante salée : ils doivent rester croquants.',
  'Saler et poivrer le saumon. Le cuire côté peau 4 min dans l''huile chaude, puis 2 à 3 min de l''autre côté.',
  'Mélanger la sauce soja avec le jus du citron.',
  'Servir le saumon sur le riz avec le brocoli, arroser de sauce.'
], array['sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 25, 2)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000004';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000004', 0, '4 Pavés de saumon', 'Pavés de saumon', 4, null, 26036),
  ('00000000-0000-4000-8000-000000000004', 1, '300 g Riz', 'Riz', 300, 'g'::public.ingredient_unit, 9100),
  ('00000000-0000-4000-8000-000000000004', 2, '1 Brocoli', 'Brocoli', 1, null, 20057),
  ('00000000-0000-4000-8000-000000000004', 3, '1 Citron', 'Citron', 1, null, 2028),
  ('00000000-0000-4000-8000-000000000004', 4, '2 c. à soupe Huile d''olive', 'Huile d''olive', 2, 'cuillere_soupe'::public.ingredient_unit, 17270),
  ('00000000-0000-4000-8000-000000000004', 5, '2 c. à soupe Sauce soja (sans gluten : tamari)', 'Sauce soja (sans gluten : tamari)', 2, 'cuillere_soupe'::public.ingredient_unit, 11104),
  ('00000000-0000-4000-8000-000000000004', 6, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000004', 7, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Hachis parmentier
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000005', null, 'Hachis parmentier', 4, array[
  'Éplucher les pommes de terre, les couper en morceaux et les cuire 20 min dans l''eau bouillante salée.',
  'Pendant ce temps, émincer les oignons et les faire fondre 5 min dans un peu de beurre. Ajouter le bœuf, l''émietter et le faire dorer 8 min avec le concentré de tomate. Saler, poivrer.',
  'Écraser les pommes de terre avec le reste du beurre, le lait chaud et la muscade.',
  'Préchauffer le four à 200 °C. Étaler la viande dans un plat, couvrir de purée, parsemer d''emmental.',
  'Enfourner 20 min, jusqu''à ce que le dessus soit doré.'
], array['sans_porc']::public.recipe_diet[], 60, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000005';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000005', 0, '500 g Bœuf haché', 'Bœuf haché', 500, 'g'::public.ingredient_unit, 6254),
  ('00000000-0000-4000-8000-000000000005', 1, '1 kg Pommes de terre', 'Pommes de terre', 1, 'kg'::public.ingredient_unit, 4008),
  ('00000000-0000-4000-8000-000000000005', 2, '2 Oignons', 'Oignons', 2, null, 20034),
  ('00000000-0000-4000-8000-000000000005', 3, '15 cl Lait', 'Lait', 15, 'cl'::public.ingredient_unit, 19041),
  ('00000000-0000-4000-8000-000000000005', 4, '40 g Beurre', 'Beurre', 40, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000005', 5, '1 c. à soupe Concentré de tomate', 'Concentré de tomate', 1, 'cuillere_soupe'::public.ingredient_unit, 20068),
  ('00000000-0000-4000-8000-000000000005', 6, '60 g Emmental râpé', 'Emmental râpé', 60, 'g'::public.ingredient_unit, 12118),
  ('00000000-0000-4000-8000-000000000005', 7, '1 pincée Muscade', 'Muscade', 1, 'pincee'::public.ingredient_unit, 11048),
  ('00000000-0000-4000-8000-000000000005', 8, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000005', 9, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Blanquette de veau
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000006', null, 'Blanquette de veau', 6, array[
  'Mettre le veau dans une cocotte, couvrir d''eau froide, porter à ébullition et écumer.',
  'Ajouter les carottes en rondelles, l''oignon piqué des clous de girofle, le bouquet garni, saler. Cuire 1 h 30 à petits frémissements.',
  '20 min avant la fin, cuire le riz, et faire revenir les champignons émincés dans un peu de beurre.',
  'Sortir la viande et les carottes, garder 60 cl de bouillon filtré.',
  'Dans la cocotte, faire fondre le beurre, ajouter la farine, remuer 1 min, puis verser le bouillon en fouettant jusqu''à ce que la sauce épaississe.',
  'Hors du feu, ajouter la crème mélangée au jaune d''œuf et au jus du citron. Remettre la viande, les carottes et les champignons, réchauffer sans faire bouillir. Servir avec le riz.'
], array['sans_porc']::public.recipe_diet[], 120, 3)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000006';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000006', 0, '1,2 kg Épaule de veau en morceaux', 'Épaule de veau en morceaux', 1.2, 'kg'::public.ingredient_unit, 6560),
  ('00000000-0000-4000-8000-000000000006', 1, '3 Carottes', 'Carottes', 3, null, 20009),
  ('00000000-0000-4000-8000-000000000006', 2, '1 Oignon', 'Oignon', 1, null, 20034),
  ('00000000-0000-4000-8000-000000000006', 3, '2 Clous de girofle', 'Clous de girofle', 2, null, 11052),
  ('00000000-0000-4000-8000-000000000006', 4, '1 Bouquet garni', 'Bouquet garni', 1, null, null),
  ('00000000-0000-4000-8000-000000000006', 5, '250 g Champignons de Paris', 'Champignons de Paris', 250, 'g'::public.ingredient_unit, 20056),
  ('00000000-0000-4000-8000-000000000006', 6, '40 g Beurre', 'Beurre', 40, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000006', 7, '40 g Farine', 'Farine', 40, 'g'::public.ingredient_unit, 9435),
  ('00000000-0000-4000-8000-000000000006', 8, '20 cl Crème fraîche', 'Crème fraîche', 20, 'cl'::public.ingredient_unit, 19410),
  ('00000000-0000-4000-8000-000000000006', 9, '1 Jaune d''œuf', 'Jaune d''œuf', 1, null, 22002),
  ('00000000-0000-4000-8000-000000000006', 10, '1 Citron', 'Citron', 1, null, 2028),
  ('00000000-0000-4000-8000-000000000006', 11, '400 g Riz', 'Riz', 400, 'g'::public.ingredient_unit, 9100),
  ('00000000-0000-4000-8000-000000000006', 12, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000006', 13, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Ratatouille
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000007', null, 'Ratatouille', 4, array[
  'Couper tous les légumes en dés de 2 cm, émincer l''oignon et hacher l''ail.',
  'Faire revenir l''aubergine 5 min dans la moitié de l''huile, puis la réserver. Faire de même avec les courgettes, puis les poivrons.',
  'Dans la même cocotte, faire fondre l''oignon dans le reste de l''huile, ajouter l''ail et les tomates, cuire 5 min.',
  'Remettre tous les légumes, ajouter les herbes, saler, poivrer. Laisser mijoter 30 min à couvert, à feu doux.',
  'Servir chaud ou froid, avec du riz ou du pain.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 60, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000007';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000007', 0, '1 Aubergine', 'Aubergine', 1, null, 20053),
  ('00000000-0000-4000-8000-000000000007', 1, '2 Courgettes', 'Courgettes', 2, null, 20020),
  ('00000000-0000-4000-8000-000000000007', 2, '2 Poivrons (rouge et jaune)', 'Poivrons (rouge et jaune)', 2, null, 20087),
  ('00000000-0000-4000-8000-000000000007', 3, '4 Tomates', 'Tomates', 4, null, 20276),
  ('00000000-0000-4000-8000-000000000007', 4, '1 Oignon', 'Oignon', 1, null, 20034),
  ('00000000-0000-4000-8000-000000000007', 5, '2 Gousses d''ail', 'Gousses d''ail', 2, null, 11000),
  ('00000000-0000-4000-8000-000000000007', 6, '4 c. à soupe Huile d''olive', 'Huile d''olive', 4, 'cuillere_soupe'::public.ingredient_unit, 17270),
  ('00000000-0000-4000-8000-000000000007', 7, '1 c. à café Herbes de Provence', 'Herbes de Provence', 1, 'cuillere_cafe'::public.ingredient_unit, 11060),
  ('00000000-0000-4000-8000-000000000007', 8, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000007', 9, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Dahl de lentilles corail
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000008', null, 'Dahl de lentilles corail', 4, array[
  'Rincer les lentilles jusqu''à ce que l''eau soit claire.',
  'Faire revenir l''oignon émincé 5 min dans l''huile, ajouter l''ail, le gingembre râpé, le curry et le cumin, remuer 1 min.',
  'Ajouter les lentilles, les tomates, le lait de coco et l''eau. Saler.',
  'Cuire 20 min à feu doux en remuant souvent : les lentilles doivent se défaire. Ajouter un peu d''eau si ça épaissit trop.',
  'Pendant ce temps, cuire le riz. Servir le dahl sur le riz.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 35, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000008';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000008', 0, '250 g Lentilles corail', 'Lentilles corail', 250, 'g'::public.ingredient_unit, 20535),
  ('00000000-0000-4000-8000-000000000008', 1, '40 cl Lait de coco', 'Lait de coco', 40, 'cl'::public.ingredient_unit, 18041),
  ('00000000-0000-4000-8000-000000000008', 2, '400 g Tomates concassées', 'Tomates concassées', 400, 'g'::public.ingredient_unit, 20137),
  ('00000000-0000-4000-8000-000000000008', 3, '1 Oignon', 'Oignon', 1, null, 20034),
  ('00000000-0000-4000-8000-000000000008', 4, '2 Gousses d''ail', 'Gousses d''ail', 2, null, 11000),
  ('00000000-0000-4000-8000-000000000008', 5, '1 morceau de 3 cm Gingembre frais', 'Gingembre frais (morceau de 3 cm)', 1, null, 11074),
  ('00000000-0000-4000-8000-000000000008', 6, '1 c. à soupe Curry en poudre', 'Curry en poudre', 1, 'cuillere_soupe'::public.ingredient_unit, 11005),
  ('00000000-0000-4000-8000-000000000008', 7, '1 c. à café Cumin', 'Cumin', 1, 'cuillere_cafe'::public.ingredient_unit, 11042),
  ('00000000-0000-4000-8000-000000000008', 8, '1 c. à soupe Huile', 'Huile', 1, 'cuillere_soupe'::public.ingredient_unit, 17440),
  ('00000000-0000-4000-8000-000000000008', 9, '50 cl Eau', 'Eau', 50, 'cl'::public.ingredient_unit, 18066),
  ('00000000-0000-4000-8000-000000000008', 10, '300 g Riz basmati', 'Riz basmati', 300, 'g'::public.ingredient_unit, 9119),
  ('00000000-0000-4000-8000-000000000008', 11, 'au goût Sel', 'Sel (au goût)', null, null, 11017);

-- Curry de pois chiches et épinards
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000009', null, 'Curry de pois chiches et épinards', 4, array[
  'Cuire le riz selon le paquet.',
  'Faire revenir l''oignon émincé 5 min dans l''huile, ajouter l''ail haché, le garam masala et le curcuma, remuer 1 min.',
  'Ajouter les tomates et le lait de coco, saler, porter à frémissement.',
  'Ajouter les pois chiches rincés, cuire 10 min à feu doux.',
  'Ajouter les épinards, remuer 2 min jusqu''à ce qu''ils fondent. Servir avec le riz.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 30, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000009';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000009', 0, '500 g Pois chiches en conserve (égouttés)', 'Pois chiches en conserve (égouttés)', 500, 'g'::public.ingredient_unit, 20532),
  ('00000000-0000-4000-8000-000000000009', 1, '200 g Épinards frais', 'Épinards frais', 200, 'g'::public.ingredient_unit, 20059),
  ('00000000-0000-4000-8000-000000000009', 2, '40 cl Lait de coco', 'Lait de coco', 40, 'cl'::public.ingredient_unit, 18041),
  ('00000000-0000-4000-8000-000000000009', 3, '400 g Tomates concassées', 'Tomates concassées', 400, 'g'::public.ingredient_unit, 20137),
  ('00000000-0000-4000-8000-000000000009', 4, '1 Oignon', 'Oignon', 1, null, 20034),
  ('00000000-0000-4000-8000-000000000009', 5, '2 Gousses d''ail', 'Gousses d''ail', 2, null, 11000),
  ('00000000-0000-4000-8000-000000000009', 6, '2 c. à café Garam masala', 'Garam masala', 2, 'cuillere_cafe'::public.ingredient_unit, null),
  ('00000000-0000-4000-8000-000000000009', 7, '1 c. à café Curcuma', 'Curcuma', 1, 'cuillere_cafe'::public.ingredient_unit, 11089),
  ('00000000-0000-4000-8000-000000000009', 8, '1 c. à soupe Huile', 'Huile', 1, 'cuillere_soupe'::public.ingredient_unit, 17440),
  ('00000000-0000-4000-8000-000000000009', 9, '300 g Riz basmati', 'Riz basmati', 300, 'g'::public.ingredient_unit, 9119),
  ('00000000-0000-4000-8000-000000000009', 10, 'au goût Sel', 'Sel (au goût)', null, null, 11017);

-- Crêpes
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget)
values ('00000000-0000-4000-8000-000000000010', null, 'Crêpes', 4, array[
  'Dans un saladier, mélanger la farine, le sucre et le sel. Creuser un puits et y casser les œufs.',
  'Mélanger en versant le lait petit à petit, pour éviter les grumeaux.',
  'Ajouter le beurre fondu. Laisser reposer la pâte 1 h au frais.',
  'Chauffer une poêle légèrement graissée, verser une petite louche de pâte en inclinant la poêle pour l''étaler.',
  'Cuire 1 min, retourner, cuire encore 30 s. Recommencer jusqu''à la fin de la pâte.'
], array['vegetarien', 'sans_porc']::public.recipe_diet[], 90, 1)
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000010';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000010', 0, '250 g Farine', 'Farine', 250, 'g'::public.ingredient_unit, 9435),
  ('00000000-0000-4000-8000-000000000010', 1, '4 Œufs', 'Œufs', 4, null, 22000),
  ('00000000-0000-4000-8000-000000000010', 2, '50 cl Lait', 'Lait', 50, 'cl'::public.ingredient_unit, 19041),
  ('00000000-0000-4000-8000-000000000010', 3, '50 g Beurre fondu', 'Beurre fondu', 50, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000010', 4, '1 c. à soupe Sucre', 'Sucre', 1, 'cuillere_soupe'::public.ingredient_unit, 31016),
  ('00000000-0000-4000-8000-000000000010', 5, '1 pincée Sel', 'Sel', 1, 'pincee'::public.ingredient_unit, 11017);
