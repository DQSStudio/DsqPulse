create schema if not exists pulse;

create or replace function pulse.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = core, pulse, public as $$
  select exists (select 1 from core.memberships m
    where m.org_id = p_org and m.user_id = auth.uid() and m.ruolo::text in ('titolare','socio'));
$$;

create table pulse.profili (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.organizations(id) on delete cascade,
  slug text not null check (slug in ('studio','lab')),
  nome text not null,
  conoscenza text not null default '',
  aggiornato_il timestamptz not null default now(),
  unique (org_id, slug)
);

create table pulse.domande (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.organizations(id) on delete cascade,
  profilo text not null check (profilo in ('studio','lab')),
  testo text not null,
  fonte text not null default 'base',
  stato text not null default 'aperta' check (stato in ('aperta','risposta','saltata')),
  creato_il timestamptz not null default now()
);

create table pulse.risposte (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.organizations(id) on delete cascade,
  profilo text not null check (profilo in ('studio','lab')),
  domanda_id uuid references pulse.domande(id) on delete set null,
  domanda text not null,
  risposta text not null,
  creato_il timestamptz not null default now()
);

create table pulse.contenuti (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references core.organizations(id) on delete cascade,
  profilo text not null check (profilo in ('studio','lab')),
  piattaforma text not null,
  formato text not null,
  tema text not null,
  hook text, scene jsonb not null default '[]', caption text, tags text,
  media_url text,
  stato text not null default 'bozza' check (stato in ('bozza','programmato','pubblicato','errore')),
  quando timestamptz,
  ig_media_id text,
  errore text,
  creato_il timestamptz not null default now()
);
create index on pulse.contenuti (org_id, profilo, quando);
create index on pulse.risposte (org_id, profilo, creato_il);

do $$ declare t text; begin
  foreach t in array array['profili','domande','risposte','contenuti'] loop
    execute format('alter table pulse.%I enable row level security', t);
    execute format('create policy %I on pulse.%I for all to authenticated using (pulse.is_member(org_id)) with check (pulse.is_member(org_id))', t||'_membri', t);
  end loop;
end $$;

grant usage on schema pulse to authenticated, service_role;
grant select, insert, update, delete on all tables in schema pulse to authenticated, service_role;
grant execute on function pulse.is_member(uuid) to authenticated;

insert into pulse.profili (org_id, slug, nome) values
 ('d0000000-0000-4000-8000-0000000000d5','studio','Desearq Studio'),
 ('d0000000-0000-4000-8000-0000000000d5','lab','Desearq Lab');

notify pgrst, 'reload schema';

-- Il progetto espone solo "public" via API: viste sottili con RLS del chiamante.
create view public.pulse_profili with (security_invoker = true) as select * from pulse.profili;
create view public.pulse_domande with (security_invoker = true) as select * from pulse.domande;
create view public.pulse_risposte with (security_invoker = true) as select * from pulse.risposte;
create view public.pulse_contenuti with (security_invoker = true) as select * from pulse.contenuti;
revoke all on public.pulse_profili, public.pulse_domande, public.pulse_risposte, public.pulse_contenuti from anon, public;
grant select, insert, update, delete on public.pulse_profili, public.pulse_domande, public.pulse_risposte, public.pulse_contenuti to authenticated, service_role;
