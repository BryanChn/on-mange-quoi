-- Range par rayon les articles déjà dans les listes (2026-11-27). Généré par
-- scripts/aisle-backfill-to-sql.ts depuis le dictionnaire de l'app (src/lib/shopping-rules.ts) :
-- ne pas modifier à la main, régénérer.
-- Seulement les articles encore dans « autres », et pas ceux dont le foyer a déjà choisi le
-- rayon pour ce nom. Articles rangés compris : ils nourrissent « Souvent acheté ».

create function private.shopping_label_key(item_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(
    replace(replace(lower(trim(regexp_replace(item_label, '[[:space:]]+', ' ', 'g'))), 'œ', 'oe'), 'æ', 'ae'),
    'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
    'aaaaaaceeeeiiiinooooouuuuyy'
  );
$$;

create function private.guess_shopping_aisle(item_label text)
returns public.shopping_aisle
language plpgsql
immutable
set search_path = ''
as $$
declare
  phrases text[] := array['surgele', 'bebe', 'sirop d''erable', 'jus de citron', 'the glace', 'creme dessert', 'lait de coco', 'creme de coco', 'lait infantile', 'lait bebe', 'lait de croissance', 'petit pot', 'petits pots', 'pomme de terre', 'pommes de terre', 'petits pois', 'herbes fraiches', 'pate feuilletee', 'pate brisee', 'pate sablee', 'pate a pizza', 'pates fraiches', 'pate a tartiner', 'pate de fruits', 'fruits secs', 'fruits de mer', 'thon frais', 'pain de mie', 'pain d''epices', 'creme glacee', 'papier toilette', 'essuie tout', 'sac poubelle', 'sacs poubelle', 'liquide vaisselle', 'gel douche', 'huile d''olive', 'sauce tomate', 'concentre de tomate']::text[];
  phrase_aisles text[] := array['surgeles', 'bebe', 'epicerie_sucree', 'epicerie_salee', 'boissons', 'cremerie', 'epicerie_salee', 'epicerie_salee', 'bebe', 'bebe', 'bebe', 'bebe', 'bebe', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'boucherie_poisson', 'boucherie_poisson', 'boulangerie', 'epicerie_sucree', 'surgeles', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee']::text[];
  multis text[] := array['noix de saint jacques', 'pate en croute', 'dessert lacte', 'petit suisse', 'petits suisses', 'fromage blanc', 'pois chiche', 'biscuit apero', 'herbes de provence', 'lait d''amande', 'tomates pelees', 'sirop d''erable', 'flocons d''avoine', 'raisins secs', 'creme dessert', 'poisson pane', 'ice tea', 'friandises pour', 'apres shampo', 'serviette hygienique', 'protege slip', 'pastille lave', 'creme solaire', 'gel hydroalcoolique']::text[];
  multi_aisles text[] := array['boucherie_poisson', 'charcuterie_traiteur', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'surgeles', 'boissons', 'animaux', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene']::text[];
  words text[] := array['tomate', 'pomme', 'poire', 'banane', 'citron', 'orange', 'clementine', 'mandarine', 'pamplemousse', 'raisin', 'fraise', 'framboise', 'myrtille', 'peche', 'nectarine', 'abricot', 'cerise', 'prune', 'kiwi', 'ananas', 'mangue', 'melon', 'pasteque', 'grenade', 'figue', 'avocat', 'salade', 'laitue', 'roquette', 'mache', 'epinard', 'carotte', 'oignon', 'echalote', 'poireau', 'courgette', 'aubergine', 'poivron', 'concombre', 'radis', 'chou', 'brocoli', 'champignon', 'haricot', 'patate', 'potiron', 'potimarron', 'courge', 'butternut', 'celeri', 'fenouil', 'navet', 'panais', 'betterave', 'persil', 'coriandre', 'basilic', 'menthe', 'ciboulette', 'estragon', 'thym', 'romarin', 'gingembre', 'legume', 'fruit', 'asperge', 'artichaut', 'endive', 'ail', 'lime', 'poulet', 'dinde', 'canard', 'pintade', 'boeuf', 'veau', 'porc', 'agneau', 'lapin', 'viande', 'steak', 'hache', 'escalope', 'roti', 'cote', 'filet', 'entrecote', 'bavette', 'merguez', 'poisson', 'saumon', 'cabillaud', 'colin', 'crevette', 'moule', 'lieu', 'truite', 'dorade', 'bar', 'sole', 'maquereau', 'calamar', 'jambon', 'lardon', 'saucisse', 'saucisson', 'chorizo', 'bacon', 'rillette', 'terrine', 'knacki', 'salami', 'coppa', 'surimi', 'houmous', 'taboule', 'quiche', 'gnocchi', 'ravioli', 'tortellini', 'blini', 'tarama', 'guacamole', 'lait', 'oeuf', 'beurre', 'fromage', 'yaourt', 'yogourt', 'creme', 'parmesan', 'emmental', 'gruyere', 'comte', 'mozzarella', 'burrata', 'feta', 'chevre', 'camembert', 'brie', 'raclette', 'reblochon', 'roquefort', 'mascarpone', 'ricotta', 'skyr', 'faisselle', 'margarine', 'kefir', 'pain', 'baguette', 'brioche', 'croissant', 'viennoiserie', 'tortilla', 'wrap', 'pita', 'biscotte', 'galette', 'pate', 'spaghetti', 'tagliatelle', 'penne', 'fusilli', 'macaroni', 'lasagne', 'nouille', 'riz', 'semoule', 'quinoa', 'boulgour', 'polenta', 'farine', 'fecule', 'maizena', 'huile', 'vinaigre', 'sel', 'poivre', 'epice', 'moutarde', 'mayonnaise', 'ketchup', 'sauce', 'pesto', 'bouillon', 'conserve', 'lentille', 'flageolet', 'thon', 'sardine', 'olive', 'cornichon', 'capre', 'chips', 'cracker', 'cacahuete', 'pistache', 'soupe', 'levure', 'chapelure', 'curry', 'paprika', 'cumin', 'cannelle', 'muscade', 'origan', 'soja', 'coulis', 'sucre', 'chocolat', 'cacao', 'cafe', 'the', 'tisane', 'infusion', 'biscuit', 'gateau', 'madeleine', 'cookie', 'confiture', 'miel', 'cereale', 'muesli', 'compote', 'nutella', 'bonbon', 'caramel', 'vanille', 'amande', 'noisette', 'noix', 'pruneau', 'surgele', 'glace', 'frite', 'nugget', 'esquimau', 'sorbet', 'cone', 'glacon', 'eau', 'jus', 'vin', 'biere', 'soda', 'coca', 'limonade', 'sirop', 'cidre', 'champagne', 'smoothie', 'rhum', 'whisky', 'aperitif', 'couche', 'lingette', 'biberon', 'tetine', 'croquette', 'patee', 'litiere', 'chat', 'chien', 'eponge', 'papier', 'lessive', 'adoucissant', 'savon', 'shampo', 'dentifrice', 'brosse', 'deodorant', 'mouchoir', 'coton', 'rasoir', 'tampon', 'aluminium', 'film', 'poubelle', 'javel', 'nettoyant', 'vaisselle', 'sopalin', 'pile', 'ampoule', 'bougie', 'allumette']::text[];
  word_aisles text[] := array['fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'fruits_legumes', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'boucherie_poisson', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'charcuterie_traiteur', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'cremerie', 'boulangerie', 'boulangerie', 'boulangerie', 'boulangerie', 'boulangerie', 'boulangerie', 'boulangerie', 'boulangerie', 'boulangerie', 'boulangerie', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_salee', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'epicerie_sucree', 'surgeles', 'surgeles', 'surgeles', 'surgeles', 'surgeles', 'surgeles', 'surgeles', 'surgeles', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'boissons', 'bebe', 'bebe', 'bebe', 'bebe', 'animaux', 'animaux', 'animaux', 'animaux', 'animaux', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene', 'maison_hygiene']::text[];
  normalized text;
  word text;
  best text;
  best_length integer;
begin
  -- Comme normalizeLabel, puis les tirets comptent comme des espaces.
  normalized := replace(private.shopping_label_key(item_label), '-', ' ');

  for i in 1 .. cardinality(phrases) loop
    if position(phrases[i] in normalized) > 0 then
      return phrase_aisles[i]::public.shopping_aisle;
    end if;
  end loop;
  for i in 1 .. cardinality(multis) loop
    if position(multis[i] in normalized) > 0 then
      return multi_aisles[i]::public.shopping_aisle;
    end if;
  end loop;

  -- Les mots dans l'ordre du nom ; pour un mot, le mot-clé le plus long.
  foreach word in array regexp_split_to_array(normalized, '[[:space:]'']+') loop
    best := null;
    best_length := 0;
    for i in 1 .. cardinality(words) loop
      if (length(words[i]) <= 3 and (word = words[i] or word = words[i] || 's'))
        or (length(words[i]) > 3 and starts_with(word, words[i]))
      then
        if length(words[i]) > best_length then
          best := word_aisles[i];
          best_length := length(words[i]);
        end if;
      end if;
    end loop;
    if best is not null then
      return best::public.shopping_aisle;
    end if;
  end loop;
  return 'autres';
end;
$$;

update public.shopping_items as item
set aisle = private.guess_shopping_aisle(item.label)
where item.aisle = 'autres'
  and not exists (
    select 1
    from public.shopping_aisle_choices as choice
    where choice.group_id = item.group_id
      and choice.label_key = private.shopping_label_key(item.label)
  );

drop function private.guess_shopping_aisle(text);
drop function private.shopping_label_key(text);
