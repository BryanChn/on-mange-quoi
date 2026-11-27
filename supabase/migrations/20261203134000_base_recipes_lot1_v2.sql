-- Recettes de base, lot 1 : textes originaux écrits pour l'app.
-- Généré par scripts/base-recipes-to-sql.ts depuis scripts/base-recipes/lot1.json (la
-- source à modifier) : chaque ligne passe par ingredientFromFields, chaque aliment est relié à
-- Ciqual. Ids fixes : relancer met à jour sans doublon (les copies pointent vers la recette).

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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000001', null, 'Pâtes carbonara', 4, array[
  'Mets une grande casserole d''eau à chauffer et sale-la quand elle bout. Cuis les spaghetti 1 min de moins que le temps du paquet : elles finiront dans la poêle.',
  'Pendant ce temps, fais fondre les lardons à feu moyen dans une grande poêle, sans matière grasse, jusqu''à ce qu''ils soient dorés et que leur gras ait fondu. Coupe le feu.',
  'Dans un bol, bats les œufs, les jaunes et le parmesan avec beaucoup de poivre fraîchement moulu.',
  'Garde un verre d''eau de cuisson, égoutte les pâtes et verse-les dans la poêle des lardons, toujours feu éteint. Mélange pour bien les enrober de gras.',
  'Attends 1 min que la poêle tiédisse, puis verse les œufs en remuant vite, avec quelques cuillères d''eau de cuisson, jusqu''à obtenir une sauce brillante qui nappe les pâtes. Sers tout de suite.'
], '{}', 20, 1, 'Le feu est l''ennemi de la carbonara. Les œufs doivent épaissir la sauce, pas cuire : c''est la chaleur des pâtes et l''amidon de l''eau de cuisson qui font la crème. Si ça devient trop épais, une cuillère d''eau de cuisson et ça repart.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000002', null, 'Omelette aux champignons', 2, array[
  'Nettoie les champignons avec un papier humide, pas sous l''eau (ils boivent comme des éponges), puis émince-les.',
  'Fais-les sauter 5 min à feu vif dans la moitié du beurre, sans trop les remuer : ils rendent leur eau, puis ils dorent. Sale à la fin et réserve.',
  'Bats les œufs à la fourchette avec le sel, le poivre et le persil ciselé, juste assez pour mélanger les blancs et les jaunes.',
  'Fais mousser le reste du beurre à feu moyen, verse les œufs et remue sans arrêt avec le dos de la fourchette en secouant la poêle, 1 à 2 min, jusqu''à ce qu''ils soient pris mais encore crémeux.',
  'Ajoute les champignons sur une moitié, plie l''omelette et fais-la glisser dans l''assiette. Elle doit rester blonde, sans coloration.'
], array['vegetarien', 'sans_gluten']::public.recipe_diet[], 15, 1, 'Une omelette se joue en deux minutes. Remue sans arrêt : tu obtiens de tout petits grains et une texture crémeuse. Plie-la quand le dessus est encore baveux, la chaleur de l''assiette termine la cuisson. Blonde dehors, baveuse dedans : c''est l''omelette à la française.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000002';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000002', 0, '5 Œufs', 'Œufs', 5, null, 22000),
  ('00000000-0000-4000-8000-000000000002', 1, '250 g Champignons de Paris', 'Champignons de Paris', 250, 'g'::public.ingredient_unit, 20056),
  ('00000000-0000-4000-8000-000000000002', 2, '20 g Beurre', 'Beurre', 20, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000002', 3, 'quelques brins Persil', 'Persil (quelques brins)', null, null, 11014),
  ('00000000-0000-4000-8000-000000000002', 4, 'au goût Sel', 'Sel (au goût)', null, null, 11017),
  ('00000000-0000-4000-8000-000000000002', 5, 'au goût Poivre', 'Poivre (au goût)', null, null, 11015);

-- Poulet au curry et lait de coco
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000003', null, 'Poulet au curry et lait de coco', 4, array[
  'Rince le riz jusqu''à ce que l''eau soit claire, puis cuis-le selon le paquet.',
  'Émince l''oignon, hache l''ail et râpe le gingembre. Coupe le poulet en bouchées et sale-le.',
  'Fais dorer le poulet 4 à 5 min dans l''huile bien chaude, en deux fois si la poêle est petite, puis réserve-le.',
  'Dans la même poêle, fais fondre l''oignon 5 min à feu moyen. Ajoute l''ail, le gingembre et le curry, et remue 1 min : ça doit sentir fort, sans brûler.',
  'Verse les tomates et le lait de coco, gratte bien les sucs au fond, remets le poulet et laisse mijoter 10 à 15 min à feu doux.',
  'Goûte, rectifie le sel et sers sur le riz, parsemé de coriandre.'
], array['sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 35, 2, 'Les épices se réveillent dans le gras. Une minute dans l''huile chaude, avant le liquide, et le curry passe de la poudre au parfum. Pour finir, un filet de citron vert relève la sauce coco.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000004', null, 'Saumon, riz et brocoli', 4, array[
  'Cuis le riz selon le paquet.',
  'Détaille le brocoli en petits bouquets et cuis-les 5 à 6 min à la vapeur ou dans l''eau bouillante salée : ils doivent rester vert vif et un peu croquants.',
  'Sèche bien le saumon avec du papier absorbant, surtout la peau, et sale-le juste avant de le cuire.',
  'Pose-le côté peau dans l''huile chaude et appuie 20 s avec une spatule pour qu''il reste à plat. Laisse-le cuire 4 à 5 min sans y toucher, puis retourne-le pour 1 min seulement.',
  'Mélange la sauce soja et le jus du citron. Sers le saumon sur le riz avec le brocoli, arrosé de sauce.'
], array['sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 25, 2, 'Une peau croustillante commence par une peau sèche : l''eau fait de la vapeur, et la vapeur ramollit. Laisse le saumon cuire presque entièrement côté peau : la chair reste nacrée et la peau croque comme une chips.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000005', null, 'Hachis parmentier', 4, array[
  'Épluche les pommes de terre, coupe-les en gros morceaux et mets-les dans l''eau froide salée. Porte à ébullition et cuis 20 min, jusqu''à ce que la pointe d''un couteau s''enfonce sans résistance.',
  'Pendant ce temps, fais fondre les oignons 5 min dans un peu de beurre. Ajoute le bœuf, laisse-le dorer avant de l''émietter, puis cuis 8 min avec le concentré de tomate. Sale, poivre.',
  'Égoutte les pommes de terre et laisse-les fumer 2 min pour qu''elles sèchent. Écrase-les au presse-purée, ajoute le reste du beurre froid en morceaux, puis le lait chaud et la muscade.',
  'Préchauffe le four à 200 °C. Étale la viande dans un plat, couvre de purée, trace des sillons à la fourchette et parsème d''emmental.',
  'Enfourne 20 min, jusqu''à ce que le dessus soit bien doré.'
], array['sans_porc']::public.recipe_diet[], 60, 1, 'Pas de mixeur pour la purée : il rend l''amidon collant. Écrase, puis ajoute le beurre froid petit à petit, c''est le principe de la célèbre purée de Joël Robuchon. Les sillons à la fourchette font des crêtes qui gratinent.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000006', null, 'Blanquette de veau', 6, array[
  'Mets le veau dans une cocotte, couvre d''eau froide et porte à ébullition. Égoutte la viande, rince-la à l''eau froide et rince aussi la cocotte.',
  'Remets le veau, couvre à nouveau d''eau froide, ajoute les carottes en rondelles, l''oignon piqué des clous de girofle et le bouquet garni. Sale et laisse cuire 1 h 30 à petits frémissements.',
  '20 min avant la fin, cuis le riz et fais sauter les champignons émincés dans un peu de beurre.',
  'Sors la viande et les carottes, et filtre 60 cl de bouillon.',
  'Dans la cocotte, fais fondre le beurre, ajoute la farine et remue 1 min sans laisser colorer. Verse le bouillon en fouettant, jusqu''à ce que la sauce nappe la cuillère, et laisse cuire 5 min.',
  'Hors du feu, ajoute la crème mélangée au jaune d''œuf et au jus du citron. Remets la viande, les carottes et les champignons, réchauffe doucement sans jamais faire bouillir, et sers avec le riz.'
], array['sans_porc']::public.recipe_diet[], 120, 3, 'Une blanquette doit rester blanche. Le premier bouillon, qu''on jette, emporte l''écume qui griserait la sauce. Et une fois la crème et le jaune ajoutés, plus jamais d''ébullition : le jaune cuirait en petits grains.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000007', null, 'Ratatouille', 4, array[
  'Coupe tous les légumes en dés de 2 cm, émince l''oignon et hache l''ail.',
  'Fais dorer l''aubergine 5 à 8 min dans une partie de l''huile, sale-la et réserve-la. Fais pareil avec les courgettes, puis avec les poivrons.',
  'Dans la même cocotte, fais fondre l''oignon dans le reste de l''huile, ajoute l''ail et les tomates, et cuis 5 min.',
  'Remets tous les légumes, ajoute les herbes, poivre, et laisse mijoter 30 min à couvert, à feu doux.',
  'Goûte, ajoute un filet d''huile d''olive au dernier moment et sers chaud, tiède ou froid.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 60, 1, 'Chaque légume sa cuisson. Dorés séparément, l''aubergine, la courgette et le poivron gardent leur goût et leur tenue au lieu de bouillir ensemble : c''est la méthode que défendait Joël Robuchon.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000008', null, 'Dahl de lentilles corail', 4, array[
  'Rince les lentilles jusqu''à ce que l''eau soit claire : ça enlève l''amidon qui fait mousser.',
  'Fais fondre l''oignon émincé 5 min dans la moitié de l''huile. Ajoute l''ail, le gingembre râpé, le curry et la moitié du cumin, et remue 1 min.',
  'Ajoute les lentilles, les tomates, le lait de coco et l''eau. Sale.',
  'Cuis 20 min à feu doux en remuant souvent : les lentilles doivent se défaire en purée. Ajoute un peu d''eau si ça épaissit trop.',
  'Pendant ce temps, cuis le riz. Au moment de servir, chauffe le reste de l''huile dans une petite poêle, fais-y grésiller le reste du cumin 30 s et verse-le sur le dahl.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 35, 1, 'Garde du cumin pour la fin. En Inde, on termine le dahl par un tadka : des épices grésillées dans l''huile chaude et versées à la dernière seconde. Leur parfum arrive à table intact.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000009', null, 'Curry de pois chiches et épinards', 4, array[
  'Cuis le riz selon le paquet.',
  'Fais fondre l''oignon émincé 5 min dans l''huile. Ajoute l''ail haché, la moitié du garam masala et le curcuma, et remue 1 min.',
  'Ajoute les tomates et le lait de coco, sale et porte à frémissement.',
  'Ajoute les pois chiches rincés et cuis 10 min à feu doux, en écrasant quelques pois chiches contre la paroi : la sauce épaissit toute seule.',
  'Ajoute les épinards et le reste du garam masala, et remue 2 min jusqu''à ce qu''ils fondent. Sers avec le riz.'
], array['vegan', 'vegetarien', 'sans_gluten', 'sans_lactose', 'sans_porc']::public.recipe_diet[], 30, 1, 'Le garam masala aime arriver à la fin. C''est un mélange d''épices déjà torréfiées, qu''une longue cuisson éteint. Une moitié au début pour le fond, l''autre à la fin pour le parfum.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
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
insert into public.recipes (id, group_id, title, servings, steps, diets, total_minutes, budget, chef_tip)
values ('00000000-0000-4000-8000-000000000010', null, 'Crêpes', 4, array[
  'Dans un saladier, mélange la farine, le sucre et le sel. Creuse un puits et casse-y les œufs.',
  'Mélange au fouet, du centre vers les bords, en versant le lait petit à petit : la pâte reste épaisse au début, c''est ce qui évite les grumeaux.',
  'Fais chauffer le beurre jusqu''à ce qu''il soit blond et sente la noisette, puis ajoute-le à la pâte. Laisse-la reposer 1 h au frais.',
  'Chauffe bien une poêle légèrement graissée et verse une petite louche de pâte en tournant la poêle pour l''étaler finement.',
  'Quand les bords dorent et se décollent (environ 1 min), retourne la crêpe et cuis 30 s. La première sert de test : ajuste le feu et la quantité de pâte.'
], array['vegetarien', 'sans_porc']::public.recipe_diet[], 90, 1, 'Un beurre noisette donne aux crêpes un goût de biscuit. Chauffé jusqu''à ce qu''il blondisse, le beurre sent la noisette grillée et parfume toute la pâte. Le repos, lui, la détend : des crêpes plus fines, qui ne se déchirent pas.')
on conflict (id) do update set title = excluded.title, servings = excluded.servings, steps = excluded.steps,
  diets = excluded.diets, total_minutes = excluded.total_minutes, budget = excluded.budget,
  chef_tip = excluded.chef_tip;
delete from public.recipe_ingredients where recipe_id = '00000000-0000-4000-8000-000000000010';
insert into public.recipe_ingredients (recipe_id, position, raw, label, quantity, unit, food_id) values
  ('00000000-0000-4000-8000-000000000010', 0, '250 g Farine', 'Farine', 250, 'g'::public.ingredient_unit, 9435),
  ('00000000-0000-4000-8000-000000000010', 1, '4 Œufs', 'Œufs', 4, null, 22000),
  ('00000000-0000-4000-8000-000000000010', 2, '50 cl Lait', 'Lait', 50, 'cl'::public.ingredient_unit, 19041),
  ('00000000-0000-4000-8000-000000000010', 3, '50 g Beurre fondu', 'Beurre fondu', 50, 'g'::public.ingredient_unit, 16400),
  ('00000000-0000-4000-8000-000000000010', 4, '1 c. à soupe Sucre', 'Sucre', 1, 'cuillere_soupe'::public.ingredient_unit, 31016),
  ('00000000-0000-4000-8000-000000000010', 5, '1 pincée Sel', 'Sel', 1, 'pincee'::public.ingredient_unit, 11017);
