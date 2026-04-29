-- supabase/migrations/0001_initial.sql
-- MAURO v0 initial schema.
--
-- Tables: workspaces, worlds, events, beta_allowlist.
-- Triggers: auto-create workspace on auth.users INSERT.
-- RPCs: create_world_with_event, add_event (writer routes call these).
-- RLS: owner-equality on workspace; beta_allowlist is service-role-only.
--
-- Source of truth: docs/superpowers/specs/2026-04-28-first-feature-pick-design.md
-- Round-3 review removed render_status/render_error/rendered_at columns and
-- the Database Webhook (render is now synchronous in the writer route).

-- ===========================================================================
-- TABLES
-- ===========================================================================

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One workspace per user in v0 (UI defaults to single workspace; schema allows
-- multi-workspace expansion later by removing this constraint).
create unique index workspaces_one_per_user on public.workspaces(owner_user_id);

create table public.worlds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  tile_slug text not null check (tile_slug in ('patagonia', 'norway', 'centralasia')),
  magic_level text not null check (magic_level in ('low', 'standard', 'high', 'wild')),
  master_seed text not null,
  created_at timestamptz not null default now(),
  latest_event_at timestamptz not null default now()
);

create index worlds_workspace_latest on public.worlds(workspace_id, latest_event_at desc);

create table public.events (
  id bigserial primary key,
  world_id uuid not null references public.worlds(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  at_date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index events_world_atdate on public.events(world_id, at_date, id);

create table public.beta_allowlist (
  email text primary key,
  added_at timestamptz not null default now(),
  note text
);

-- ===========================================================================
-- WORKSPACE AUTO-CREATION TRIGGER
-- ===========================================================================
-- On auth.users INSERT, create the user's default workspace atomically.
-- SECURITY DEFINER because new users don't yet have RLS-permission to insert
-- into workspaces (their workspace doesn't exist yet, so no row matches their
-- ownership). Standard Supabase pattern.

create or replace function public.create_default_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.workspaces (owner_user_id) values (NEW.id);
  return NEW;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.create_default_workspace();

-- ===========================================================================
-- RPCs — writer routes call these for atomic multi-row inserts
-- ===========================================================================
-- Both RPCs are SECURITY INVOKER: they run with the caller's permissions, so
-- RLS still applies. A user attempting to insert into another user's workspace
-- will fail at the INSERT step.
--
-- The writer route (Vercel API) calls the RPC, then synchronously runs the
-- hillshade pipeline and uploads the PNG to Supabase Storage. If Storage upload
-- fails, the route returns 5xx and the client retries — substrateHash is
-- deterministic so Storage upsert is idempotent. WorldQuery's read-side
-- fallback re-renders synchronously if the PNG is ever missing.

-- create_world_with_event: atomic world row + WorldCreatedEvent insert.
create or replace function public.create_world_with_event(
  p_workspace_id uuid,
  p_name text,
  p_tile_slug text,
  p_magic_level text,
  p_master_seed text,
  p_at_date date
) returns json
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_world_id uuid;
  v_event_row public.events;
begin
  insert into public.worlds (workspace_id, name, tile_slug, magic_level, master_seed)
    values (p_workspace_id, p_name, p_tile_slug, p_magic_level, p_master_seed)
    returning id into v_world_id;

  insert into public.events (world_id, workspace_id, kind, at_date, payload)
    values (
      v_world_id,
      p_workspace_id,
      'WorldCreated',
      p_at_date,
      jsonb_build_object(
        'name', p_name,
        'tileSlug', p_tile_slug,
        'magicLevel', p_magic_level,
        'masterSeed', p_master_seed
      )
    )
    returning * into v_event_row;

  return json_build_object(
    'worldId', v_world_id,
    'event', row_to_json(v_event_row)
  );
end;
$$;

-- add_event: append a subsequent event to an existing world.
-- Used for GeographyMutation events (and future event types).
create or replace function public.add_event(
  p_world_id uuid,
  p_kind text,
  p_at_date date,
  p_payload jsonb
) returns json
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_workspace_id uuid;
  v_event_row public.events;
begin
  -- Resolve workspace_id from the world. RLS prevents reading worlds in
  -- other users' workspaces, so a non-owner won't get past this select.
  select workspace_id into v_workspace_id
    from public.worlds
    where id = p_world_id;

  if v_workspace_id is null then
    raise exception 'world not found or not accessible: %', p_world_id
      using errcode = 'P0002';
  end if;

  insert into public.events (world_id, workspace_id, kind, at_date, payload)
    values (p_world_id, v_workspace_id, p_kind, p_at_date, p_payload)
    returning * into v_event_row;

  update public.worlds
    set latest_event_at = now()
    where id = p_world_id;

  return row_to_json(v_event_row);
end;
$$;

-- ===========================================================================
-- ROW-LEVEL SECURITY
-- ===========================================================================

alter table public.workspaces enable row level security;
alter table public.worlds enable row level security;
alter table public.events enable row level security;
alter table public.beta_allowlist enable row level security;

-- workspaces: owner-only.
create policy workspaces_owner_select on public.workspaces
  for select using (owner_user_id = auth.uid());

create policy workspaces_owner_insert on public.workspaces
  for insert with check (owner_user_id = auth.uid());

create policy workspaces_owner_update on public.workspaces
  for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy workspaces_owner_delete on public.workspaces
  for delete using (owner_user_id = auth.uid());

-- worlds: rows whose workspace is owned by the caller.
create policy worlds_owner_select on public.worlds
  for select using (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );

create policy worlds_owner_insert on public.worlds
  for insert with check (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );

create policy worlds_owner_update on public.worlds
  for update
  using (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  )
  with check (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );

create policy worlds_owner_delete on public.worlds
  for delete using (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );

-- events: rows whose workspace is owned by the caller. Append-only — no
-- UPDATE or DELETE policy intentionally (event log is immutable).
create policy events_owner_select on public.events
  for select using (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );

create policy events_owner_insert on public.events
  for insert with check (
    workspace_id in (select id from public.workspaces where owner_user_id = auth.uid())
  );

-- beta_allowlist: RLS enabled but NO public policies. The anon key gets zero
-- rows. Only the service_role key (server-side) can read or write this table.
-- Used by /auth/request-magic-link and /auth/callback to gate beta access.
