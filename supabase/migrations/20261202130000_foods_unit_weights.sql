-- Poids moyen d'une pièce (partie mangée, en g) pour les aliments qu'on compte plutôt qu'on ne
-- pèse : « 3 œufs », « 6 carottes ». Sans lui, une ligne en pièces n'entre pas dans les calories.
-- Ce sont des ordres de grandeur courants en cuisine, pas des valeurs de la table Ciqual (qui
-- n'en donne pas) : l'écran affiche toujours « ≈ … estimation ». Compléter au fil des recettes.

update public.foods f
set unit_weight_g = w.grams
from (values
  (22000, 50),   -- Oeuf cru (sans la coquille)
  (20009, 100),  -- Carotte, crue
  (20039, 150),  -- Poireau, cru
  (20064, 100),  -- Navet, pelé, cru
  (20034, 100),  -- Oignon, cru
  (20097, 30),   -- Échalote, crue
  (11000, 5),    -- Ail, cru (une gousse)
  (11052, 0.1),  -- Clou de girofle
  (4008, 150),   -- Pomme de terre, sans peau, crue
  (20020, 250),  -- Courgette, crue
  (20087, 150),  -- Poivron rouge, cru
  (20276, 120),  -- Tomate ronde, crue
  (23414, 230)   -- Pâte brisée, préemballée, crue (un rouleau)
) as w(id, grams)
where f.id = w.id;
