-- Deux notifications de repas de plus (validées le 2026-11-25) :
--   « C'est commandé » : quand le responsable marque la commande passée, les participants
--                        qui ont l'app le savent (« plus qu'à attendre »).
--   Le jour d'un repas chez quelqu'un : un rappel à 10 h (Paris), « C'est aujourd'hui !
--                        Tu apportes : le vin. ». Seulement si le repas a été créé avant ce
--                        jour-là (créé à 9 h pour le soir même, tout le monde est au courant).
-- Les deux passent par notify-meal ; réglages « Repas à plusieurs » et « Me tenir au
-- courant » respectés.

-- ─── « C'est commandé » ──────────────────────────────────
create function public.notify_meal_ordered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.call_edge_function(
    'notify-meal',
    jsonb_build_object('group_id', new.id, 'kind', 'ordered')
  );
  return null;
end;
$$;

revoke execute on function public.notify_meal_ordered() from public, anon, authenticated;

create trigger groups_notify_meal_ordered
  after update of soiree_step on public.groups
  for each row
  when (old.soiree_step is distinct from 'passee' and new.soiree_step = 'passee')
  execute function public.notify_meal_ordered();

-- ─── le jour d'un repas chez quelqu'un ──────────────────
alter table public.groups add column meal_day_reminded_at timestamptz;

alter table public.groups add constraint groups_meal_day_soiree_only check (
  kind = 'soiree' or meal_day_reminded_at is null
);

-- Marque et appel dans la même transaction : jamais deux rappels pour un repas. Entre 10 h et
-- 21 h (Paris) : la tâche passe toutes les 15 min, le rappel part dès 10 h.
create function public.send_meal_day_reminders(reference_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  paris_now timestamp := reference_time at time zone 'Europe/Paris';
  reminded_id uuid;
  reminded_count integer := 0;
begin
  if paris_now::time < time '10:00' or paris_now::time >= time '21:00' then
    return 0;
  end if;

  for reminded_id in
    update public.groups as g
    set meal_day_reminded_at = reference_time
    where g.kind = 'soiree'
      and g.soiree_mode = 'maison'
      and g.meal_date = paris_now::date
      and g.meal_day_reminded_at is null
      and (g.created_at at time zone 'Europe/Paris')::date < g.meal_date
    returning g.id
  loop
    perform public.call_edge_function(
      'notify-meal',
      jsonb_build_object('group_id', reminded_id, 'kind', 'meal_day')
    );
    reminded_count := reminded_count + 1;
  end loop;

  return reminded_count;
end;
$$;

revoke execute on function public.send_meal_day_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.send_meal_day_reminders(timestamptz) to service_role;

select cron.schedule(
  'meal-day-reminders',
  '*/15 * * * *',
  $$ select public.send_meal_day_reminders() $$
);
