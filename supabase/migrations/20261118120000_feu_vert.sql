-- Mesure du feu vert du MVP : « le foyer décide via l'app 4 soirs sur 7, trois semaines de suite ».
-- C'est ma mesure, pas un écran de l'app : schéma `private`, absent de l'API et fermé aux téléphones.
-- Usage (éditeur SQL du tableau de bord) :
--   select * from private.feu_vert('<id du groupe Famille>', '<date de départ>');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Un soir compte si au moins un vote du groupe a été clôturé ce jour-là, à l'heure de Paris.
-- Les votes clôturés avant p_start (tests) sont ignorés.
-- Une ligne par semaine (lundi → dimanche), y compris les semaines sans aucun vote (0 soir).
create function private.feu_vert(p_group_id uuid, p_start date)
returns table (semaine date, soirs integer, reussie boolean)
language sql
stable
set search_path = ''
as $$
  with jours as (
    -- closed_at est en UTC : 23 h 30 UTC un lundi = 0 h 30 le mardi à Paris
    select distinct (s.closed_at at time zone 'Europe/Paris')::date as jour
    from public.vote_sessions s
    where s.group_id = p_group_id
      and s.status = 'closed'
      and (s.closed_at at time zone 'Europe/Paris')::date >= p_start
  ),
  semaines as (
    select generate_series(
      date_trunc('week', p_start::timestamp),
      date_trunc('week', now() at time zone 'Europe/Paris'),
      interval '1 week'
    )::date as semaine
  )
  select w.semaine, count(j.jour)::integer, count(j.jour) >= 4
  from semaines w
  left join jours j on date_trunc('week', j.jour::timestamp)::date = w.semaine
  group by w.semaine
  order by w.semaine;
$$;

revoke all on function private.feu_vert(uuid, date) from public, anon, authenticated;
