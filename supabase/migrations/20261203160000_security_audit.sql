-- Audit de sécurité du 2026-11-27 (rapport : docs/audit-securite-2026-11-27.md).

-- ─── 1. Droits de table : défense en profondeur ──────────
-- Les premières tables (groups, profiles, votes…) gardaient les droits par défaut de
-- Supabase : TRUNCATE, TRIGGER et REFERENCES pour tout compte, invités anonymes compris, et
-- SELECT / DELETE pour le rôle anon (une requête sans connexion). La RLS ne s'applique pas à
-- TRUNCATE ; l'API (PostgREST) ne sait pas en faire, mais un droit dangereux ne doit pas
-- reposer sur une seule barrière. Les tables récentes faisaient déjà revoke all + grant.
--
-- anon n'a besoin d'aucune table : un invité se connecte (connexion anonyme, rôle
-- authenticated) avant de lire quoi que ce soit ; la page d'invitation passe par la
-- fonction soiree_preview, qui garde son droit d'exécution.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Les tables créées à l'avenir par les migrations (rôle postgres) naissent sans ces droits.
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

-- ─── 2. Rejoindre avec un code : 10 codes faux en 15 minutes ──
-- Un code d'invitation fait 8 caractères parmi 31 (≈ 850 milliards de combinaisons), mais
-- rien ne limitait les essais : un script pouvait en tester en boucle. Après 10 codes faux
-- en 15 minutes, join_group refuse tout code (même le bon) jusqu'à ce que le plus ancien
-- essai sorte de la fenêtre. Les invités anonymes ne passent déjà pas par join_group.
create table private.join_attempts (
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index join_attempts_profile_idx on private.join_attempts (profile_id, attempted_at);

alter table private.join_attempts enable row level security;
revoke all on private.join_attempts from public, anon, authenticated;

-- Même signature qu'avant : les APK installés l'appellent. Un code faux renvoie maintenant
-- null au lieu de lever une erreur : une erreur annulerait la transaction, et avec elle
-- l'essai noté (le compteur resterait à zéro). L'app traduisait déjà l'erreur P0002 en
-- null : rien ne change pour elle.
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

  -- Les essais de plus d'un jour ne servent plus : la table reste petite.
  delete from private.join_attempts
  where profile_id = caller_id and attempted_at < now() - interval '1 day';

  if (
    select count(*) from private.join_attempts
    where profile_id = caller_id and attempted_at > now() - interval '15 minutes'
  ) >= 10 then
    raise exception 'Trop d''essais' using errcode = 'P0001', hint = 'too_many_attempts';
  end if;

  -- Saisie tolérante : « k7mx 4qp9 » vaut « K7MX4QP9 ». for update : deux arrivées
  -- simultanées dans une soirée ne dépassent pas le plafond ensemble.
  select * into target
  from public.groups
  where invite_code = upper(replace(code, ' ', ''))
  for update;

  if target.id is null then
    insert into private.join_attempts (profile_id) values (caller_id);
    return null;
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
