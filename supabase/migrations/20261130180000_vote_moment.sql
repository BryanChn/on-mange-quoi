-- Midi ou soir (validé le 2026-11-25) : l'app supposait une seule décision par jour, le soir.
-- Décidé à midi, l'accueil affichait encore « Ce soir, c'est Pizza ! » à 19 h, sans proposer
-- le vote du soir. Le moment est maintenant choisi au lancement d'un vote de foyer, une
-- pastille « Ce midi » / « Ce soir » présélectionnée selon l'heure (avant 15 h : midi). Les
-- repas à plusieurs ont leur date et leurs sujets : pas de moment.
create type public.meal_moment as enum ('midi', 'soir');

alter table public.vote_sessions add column moment public.meal_moment;

-- Jusqu'ici l'app ne parlait que du soir : c'est ce que voulaient dire les votes passés.
update public.vote_sessions as s
set moment = 'soir'
from public.groups as g
where g.id = s.group_id and g.kind = 'foyer';

-- Un foyer a toujours un moment : celui de l'app, sinon l'heure du lancement (une app pas
-- encore à jour n'envoie rien). Un repas n'en a jamais.
create function public.set_vote_session_moment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.groups where id = new.group_id and kind = 'foyer') then
    new.moment := coalesce(
      new.moment,
      case when (now() at time zone 'Europe/Paris')::time < time '15:00'
        then 'midi'::public.meal_moment else 'soir'::public.meal_moment end
    );
  else
    new.moment := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_vote_session_moment() from public, anon, authenticated;

create trigger vote_sessions_set_moment
  before insert on public.vote_sessions
  for each row execute function public.set_vote_session_moment();

-- Droits par colonne (restrict_column_privileges) : l'app choisit le moment au lancement.
grant insert (moment) on public.vote_sessions to authenticated;
