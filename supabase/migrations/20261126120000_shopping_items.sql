-- Liste de courses d'un foyer (V1 · Cuisiner, décidé le 2026-11-24) : une liste par groupe,
-- partagée par ses membres et suivie en direct. Articles en texte libre ; cocher veut dire
-- « je l'ai pris » (l'article reste barré, avec qui l'a pris) ; « Retirer les achetés »
-- supprime les articles cochés.

-- ─── accès : membres d'un foyer seulement ────────────────
-- Une soirée n'a pas de liste de courses, et un invité anonyme n'est jamais membre d'un
-- foyer : la règle les écarte quand même explicitement (défense en profondeur).
create function public.is_foyer_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_anonymous_user()
    and exists (
      select 1
      from public.groups g
      join public.group_members m on m.group_id = g.id
      where g.id = target_group_id
        and g.kind = 'foyer'
        and m.profile_id = (select auth.uid())
    );
$$;

revoke execute on function public.is_foyer_member(uuid) from public, anon;
grant execute on function public.is_foyer_member(uuid) to authenticated;

-- ─── shopping_items ──────────────────────────────────────
create table public.shopping_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  label      varchar(80) not null check (length(trim(label)) > 0),
  -- Texte libre : « 2 », « 500 g », « 1 paquet ». Facultatif.
  quantity   varchar(20) check (length(trim(quantity)) > 0),
  -- Qui l'a ajouté : rempli par défaut avec le compte connecté, jamais par l'app (droits
  -- par colonne plus bas). Compte supprimé : l'article reste, sans auteur.
  added_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  -- Coché : heure et auteur posés par le trigger, jamais par l'app. checked_by peut
  -- redevenir null (compte supprimé) : l'article reste coché.
  checked_at timestamptz,
  checked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint shopping_items_checked_by_needs_checked_at
    check (checked_by is null or checked_at is not null)
);

create index shopping_items_group_idx on public.shopping_items (group_id);

alter table public.shopping_items enable row level security;

-- Droits par colonne : l'app choisit le contenu et coche ; ni l'id, ni l'auteur, ni l'heure.
revoke insert, update on public.shopping_items from anon, authenticated;
grant insert (group_id, label, quantity) on public.shopping_items to authenticated;
grant update (label, quantity, checked_at) on public.shopping_items to authenticated;

-- Tout membre du foyer lit, ajoute, coche, modifie et retire : c'est la liste du foyer.
create policy "shopping_items: visibles par les membres du foyer"
  on public.shopping_items for select
  to authenticated
  using (public.is_foyer_member(group_id));

create policy "shopping_items: ajoutés par un membre du foyer"
  on public.shopping_items for insert
  to authenticated
  with check (public.is_foyer_member(group_id));

create policy "shopping_items: modifiés par un membre du foyer"
  on public.shopping_items for update
  to authenticated
  using (public.is_foyer_member(group_id))
  with check (public.is_foyer_member(group_id));

create policy "shopping_items: retirés par un membre du foyer"
  on public.shopping_items for delete
  to authenticated
  using (public.is_foyer_member(group_id));

-- Cocher : l'app envoie seulement « coché » (checked_at non nul) ou « décoché » (null).
-- L'heure vient du serveur et l'auteur du compte connecté ; recocher un article déjà coché
-- garde la première heure et le premier auteur.
create function public.stamp_shopping_item_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.checked_at is null then
    new.checked_by := null;
  elsif old.checked_at is null then
    new.checked_at := now();
    new.checked_by := auth.uid();
  else
    new.checked_at := old.checked_at;
    new.checked_by := old.checked_by;
  end if;
  return new;
end;
$$;

create trigger shopping_items_stamp_check
  before update on public.shopping_items
  for each row execute function public.stamp_shopping_item_check();

-- Temps réel : chacun voit la liste bouger. Avec la RLS, un DELETE ne transporte que la
-- clé primaire : l'app écoute les suppressions sans filtre et recharge (src/lib/votes.ts).
alter publication supabase_realtime add table public.shopping_items;
