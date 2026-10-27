-- Création d'un groupe, adhésion par code et régénération du code (règles du 2026-10-27) :
-- code de 8 caractères permanent, régénérable par l'owner ; on rejoint directement ;
-- aucune limite de groupes ni de membres.
-- security definer : ces fonctions font ce que la RLS interdit volontairement
-- (insérer un groupe, lire un groupe dont on n'est pas encore membre). Elles vérifient
-- donc elles-mêmes qui appelle, via auth.uid().

-- ─── code d'invitation ───────────────────────────────────

-- 8 caractères parmi 31 (sans 0/O, 1/I/L, ambigus à l'oral) : ~850 milliards de codes.
-- gen_random_bytes (pgcrypto) est imprévisible, contrairement à random().
create function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  random_byte int;
begin
  while length(code) < 8 loop
    random_byte := get_byte(extensions.gen_random_bytes(1), 0);
    -- 248 = 31 × 8 : on écarte 248..255 pour que chaque caractère ait la même chance.
    if random_byte < 248 then
      code := code || substr(alphabet, random_byte % 31 + 1, 1);
    end if;
  end loop;
  return code;
end;
$$;

-- Usage interne uniquement.
revoke execute on function public.generate_invite_code() from public, anon, authenticated;

-- ─── create_group ────────────────────────────────────────

-- Crée le groupe, son code et inscrit l'owner comme membre, en une seule transaction.
create function public.create_group(group_name text)
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_group public.groups;
begin
  if caller_id is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- Un code tiré peut déjà exister (très improbable) : on retente avec un autre.
  for attempt in 1..5 loop
    begin
      insert into public.groups (name, owner_id, invite_code)
      values (trim(group_name), caller_id, public.generate_invite_code())
      returning * into new_group;
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.group_members (group_id, profile_id)
  values (new_group.id, caller_id);

  return new_group;
end;
$$;

revoke execute on function public.create_group(text) from public, anon;
grant execute on function public.create_group(text) to authenticated;

-- ─── join_group ──────────────────────────────────────────

-- Rejoint le groupe correspondant au code. Rejoindre un groupe dont on est déjà
-- membre ne fait rien (pas d'erreur) : l'app peut réessayer sans risque.
create function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_group_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  -- Saisie tolérante : « k7mx 4qp9 » vaut « K7MX4QP9 ».
  select id into target_group_id
  from public.groups
  where invite_code = upper(replace(code, ' ', ''));

  if target_group_id is null then
    raise exception 'Code d''invitation invalide' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, profile_id)
  values (target_group_id, caller_id)
  on conflict do nothing;

  return target_group_id;
end;
$$;

revoke execute on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;

-- ─── regenerate_invite_code ──────────────────────────────

-- Remplace le code du groupe : l'ancien cesse immédiatement de fonctionner.
-- Réservé à l'owner.
create function public.regenerate_invite_code(target_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  new_code text;
begin
  for attempt in 1..5 loop
    begin
      update public.groups
      set invite_code = public.generate_invite_code()
      where id = target_group_id and owner_id = caller_id
      returning invite_code into new_code;
      exit;
    exception when unique_violation then
      if attempt = 5 then
        raise;
      end if;
    end;
  end loop;

  if new_code is null then
    raise exception 'Groupe introuvable ou vous n''en êtes pas l''owner' using errcode = '42501';
  end if;

  return new_code;
end;
$$;

revoke execute on function public.regenerate_invite_code(uuid) from public, anon;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;

-- ─── droits par colonne ──────────────────────────────────

-- La politique RLS update de groups laisse l'owner modifier SA ligne, mais toutes
-- ses colonnes : il pourrait se choisir un code faible (« AAAA »). On limite
-- l'update direct au nom ; le code passe par regenerate_invite_code.
revoke update on public.groups from authenticated;
grant update (name) on public.groups to authenticated;
