-- Notifications push (MVP, décision du 2026-11-13) : prévenir le groupe au lancement et au
-- résultat d'un vote. Le trigger ne fait qu'appeler la fonction serveur notify-vote avec
-- l'identifiant de la session ; elle relit tout en base et envoie via Expo.
--
-- pg_net : la requête HTTP est mise en file et ne part qu'une fois la transaction validée
-- (un vote annulé ne notifie personne). Elle est asynchrone : le vote n'attend pas Expo.
--
-- URL et secret de la fonction sont dans Vault (chiffrés en base), jamais dans Git :
--   select vault.create_secret('<url de notify-vote>', 'notify_vote_url');
--   select vault.create_secret('<secret>', 'notify_vote_secret');
-- Le même secret est donné à la fonction : supabase secrets set NOTIFY_VOTE_SECRET=<secret>.
-- Sans eux (base locale, tests), le trigger ne fait rien et le vote marche normalement.

create extension if not exists pg_net with schema extensions;

-- security definer : le trigger s'exécute avec le rôle de l'app (authenticated), qui n'a pas
-- accès à Vault. Seul ce code précis lit les deux secrets, rien n'est exposé à l'app.
create function public.notify_vote_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  function_secret text;
begin
  select decrypted_secret into function_url
    from vault.decrypted_secrets where name = 'notify_vote_url';
  select decrypted_secret into function_secret
    from vault.decrypted_secrets where name = 'notify_vote_secret';

  if function_url is null or function_secret is null then
    return null;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', function_secret
    ),
    body := jsonb_build_object(
      'session_id', new.id,
      'event', case when tg_op = 'INSERT' then 'opened' else 'closed' end
    ),
    timeout_milliseconds := 10000
  );
  return null;
end;
$$;

-- Fonction de trigger uniquement : personne ne doit pouvoir l'appeler directement.
revoke execute on function public.notify_vote_session() from public, anon, authenticated;

create trigger notify_vote_session_opened
  after insert on public.vote_sessions
  for each row
  execute function public.notify_vote_session();

-- Seulement le passage open → closed : une autre mise à jour ne renotifie pas le groupe.
create trigger notify_vote_session_closed
  after update of status on public.vote_sessions
  for each row
  when (old.status = 'open' and new.status = 'closed')
  execute function public.notify_vote_session();
