// Génère la migration qui range par rayon les articles déjà dans les listes (2026-11-27), avec
// le même dictionnaire et le même algorithme que l'app (guessAisle dans src/lib/shopping-rules.ts).
// Usage : node scripts/aisle-backfill-to-sql.ts > supabase/migrations/<horodatage>_shopping_aisle_backfill.sql
// La fonction SQL est temporaire : créée, utilisée, puis supprimée dans la même migration.
import { AISLE_PHRASES, AISLE_WORDS } from "../src/lib/shopping-rules.ts";

const sql = (text: string) => `'${text.replace(/'/g, "''")}'`;
const array = (values: string[]) => `array[${values.map(sql).join(", ")}]::text[]`;

const multi = AISLE_WORDS.filter(([needle]) => needle.includes(" "));
const single = AISLE_WORDS.filter(([needle]) => !needle.includes(" "));

// Comme normalizeLabel : espaces rangés, minuscules, sans accents, œ → oe. C'est aussi la clé
// des choix du foyer (shopping_aisle_choices.label_key).
export const KEY_FUNCTION = `create function private.shopping_label_key(item_label text)
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
$$;`;

export const GUESS_FUNCTION = `create function private.guess_shopping_aisle(item_label text)
returns public.shopping_aisle
language plpgsql
immutable
set search_path = ''
as $$
declare
  phrases text[] := ${array(AISLE_PHRASES.map(([needle]) => needle))};
  phrase_aisles text[] := ${array(AISLE_PHRASES.map(([, aisle]) => aisle))};
  multis text[] := ${array(multi.map(([needle]) => needle))};
  multi_aisles text[] := ${array(multi.map(([, aisle]) => aisle))};
  words text[] := ${array(single.map(([needle]) => needle))};
  word_aisles text[] := ${array(single.map(([, aisle]) => aisle))};
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
$$;`;

if (process.argv[1]?.endsWith("aisle-backfill-to-sql.ts")) {
  console.log(`-- Range par rayon les articles déjà dans les listes (2026-11-27). Généré par
-- scripts/aisle-backfill-to-sql.ts depuis le dictionnaire de l'app (src/lib/shopping-rules.ts) :
-- ne pas modifier à la main, régénérer.
-- Seulement les articles encore dans « autres », et pas ceux dont le foyer a déjà choisi le
-- rayon pour ce nom. Articles rangés compris : ils nourrissent « Souvent acheté ».

${KEY_FUNCTION}

${GUESS_FUNCTION}

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
drop function private.shopping_label_key(text);`);
}
