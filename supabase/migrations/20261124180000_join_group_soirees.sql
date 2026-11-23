-- Rejoindre une soirée avec son code (retour d'usage du 2026-11-24) : quelqu'un qui a déjà
-- l'app tape le code de la soirée dans « Rejoindre avec un code », avec son compte. Le code
-- doit alors suivre les mêmes règles que le lien (join_soiree) : pas après « Commande
-- passée », 20 personnes au plus. Même signature qu'avant : les APK installés l'appellent.
create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target public.groups;
begin
  if caller_id is null or public.is_anonymous_user() then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- Saisie tolérante : « k7mx 4qp9 » vaut « K7MX4QP9 ». for update : deux arrivées
  -- simultanées dans une soirée ne dépassent pas le plafond ensemble.
  select * into target
  from public.groups
  where invite_code = upper(replace(code, ' ', ''))
  for update;

  if target.id is null then
    raise exception 'Code d''invitation invalide' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = target.id and profile_id = caller_id
  ) then
    return target.id;
  end if;

  if target.kind = 'soiree' then
    if target.soiree_step = 'passee' then
      raise exception 'La commande est déjà passée'
        using errcode = '55000', hint = 'soiree_closed';
    end if;
    if (select count(*) from public.group_members where group_id = target.id) >= 20 then
      raise exception 'La soirée est complète' using errcode = '55000', hint = 'soiree_full';
    end if;
  end if;

  insert into public.group_members (group_id, profile_id)
  values (target.id, caller_id);

  return target.id;
end;
$$;
