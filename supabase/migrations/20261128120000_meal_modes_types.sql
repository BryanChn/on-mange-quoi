-- Repas à plusieurs, trois façons (décidé le 2026-11-24, maquette :
-- https://claude.ai/artifact/Y3YUASnGDVfdk6pqzDvk4p). Retour d'usage : un repas servait à
-- choisir un dessert chez quelqu'un, pas un resto. Types et valeurs seuls dans cette
-- migration : une valeur ajoutée à un enum ne peut servir qu'après la fin de sa transaction.

-- On se commande un truc (comme avant), on va au resto, on mange chez quelqu'un.
create type public.soiree_mode as enum ('commande', 'resto', 'maison');

-- Ce que décide un vote. Un foyer vote des plats ; un repas « commande » ou « resto » vote un
-- resto ; un repas « maison » vote son menu, un vote par sujet.
create type public.vote_topic as enum ('plat', 'resto', 'apero', 'entree', 'dessert');

-- Repas « resto » ou « maison » dont tout est décidé (pas de commande à passer).
alter type public.soiree_step add value 'decide';
