-- Notifications push (MVP, décision du 2026-11-13) : prévenir le groupe au lancement et au
-- résultat d'un vote. Le trigger ne fait qu'appeler l'Edge Function notify-vote avec
-- l'identifiant de la session ; elle relit tout en base et envoie via Expo.
--
-- pg_net : la requête HTTP est mise en file et ne part qu'une fois la transaction validée
-- (un vote annulé ne notifie personne). Elle est asynchrone : le vote n'attend pas Expo.
--
-- Adresse et secret des fonctions internes dans Vault (chiffrés en base), jamais dans Git :
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'edge_functions_url');
--   select vault.create_secret('<secret>', 'edge_functions_secret');
-- Le même secret est donné aux fonctions : supabase secrets set EDGE_FUNCTIONS_SECRET=<secret>.
-- Sans eux (base locale, tests), rien n'est appelé et le vote marche normalement.

create extension if not exists pg_net with schema extensions;

-- ─── call_edge_function ──────────────────────────────────
-- Appelle une fonction interne (notify-vote, push-receipts) avec le secret partagé.
-- security definer : lit Vault, auquel les rôles de l'app n'ont pas accès.
create function public.call_edge_function(function_name text, payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  shared_secret text;
begin
  select decrypted_secret into base_url
    from vault.decrypted_secrets where name = 'edge_functions_url';
  select decrypted_secret into shared_secret
    from vault.decrypted_secrets where name = 'edge_functions_secret';

  if base_url is null or shared_secret is null then
    return;
  end if;

  perform net.http_post(
    url := base_url || '/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', shared_secret
    ),
    body := payload,
    timeout_milliseconds := 10000
  );
end;
$$;

-- Réservée aux triggers et à pg_cron : personne ne doit pouvoir l'appeler depuis l'app.
revoke execute on function public.call_edge_function(text, jsonb) from public, anon, authenticated;

-- ─── notify_vote_session ─────────────────────────────────
-- security definer : le trigger s'exécute avec le rôle de l'app (authenticated), qui n'a
-- pas le droit d'appeler call_edge_function.
create function public.notify_vote_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.call_edge_function(
    'notify-vote',
    jsonb_build_object(
      'session_id', new.id,
      'event', case when tg_op = 'INSERT' then 'opened' else 'closed' end
    )
  );
  return null;
end;
$$;

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
