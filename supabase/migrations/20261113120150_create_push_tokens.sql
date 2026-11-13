-- Jetons push (MVP, décision du 2026-11-13) : notifier le lancement et le résultat d'un vote.
-- Un jeton = l'adresse d'un téléphone pour cette app, donnée par Expo.
-- Décisions : un membre peut avoir plusieurs téléphones (clé = le jeton) ; chacun ne voit
-- que ses jetons (l'envoi passe par une fonction serveur) ; supprimés avec le compte (RGPD),
-- à la déconnexion (par l'app, AVANT signOut : après, la RLS refuserait) et quand Expo
-- répond DeviceNotRegistered (par la fonction d'envoi).

create table public.push_tokens (
  -- Format Expo : ExponentPushToken[…]. Vérifié ici : toute entrée se valide côté serveur.
  token varchar(255) primary key
    check (token ~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$'),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- La fonction d'envoi cherche les jetons des membres d'un groupe.
create index push_tokens_profile_id_idx on public.push_tokens (profile_id);

alter table public.push_tokens enable row level security;

create policy "Un membre voit ses jetons"
  on public.push_tokens for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy "Un membre supprime ses jetons"
  on public.push_tokens for delete
  to authenticated
  using (profile_id = (select auth.uid()));

-- Droits explicites plutôt que ceux accordés par défaut par Supabase : lire et supprimer
-- ses jetons, rien d'autre. L'enregistrement passe par register_push_token.
revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;

-- ─── register_push_token ─────────────────────────────────
-- security definer : un téléphone partagé (ou revendu) garde le même jeton. Si un autre
-- compte s'y connecte, le jeton doit changer de propriétaire, ce que la RLS interdit
-- (on ne touche pas la ligne d'un autre). La fonction le rattache à l'appelant seulement,
-- qui prouve posséder le téléphone puisque c'est lui qui a le jeton.
create function public.register_push_token(new_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;

  insert into public.push_tokens (token, profile_id)
  values (new_token, caller_id)
  on conflict (token) do update set profile_id = excluded.profile_id, created_at = now();
end;
$$;

revoke execute on function public.register_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;
