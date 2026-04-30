-- supabase/migrations/0003_grant_rpc_execute.sql
-- Grant EXECUTE on the v0 RPCs to the authenticated role.
--
-- Supabase doesn't auto-grant EXECUTE on user-defined functions (unlike
-- the table CRUD grants it does set up). Without this, PostgREST tries to
-- call the function on behalf of the signed-in user, hits "permission
-- denied for function", and the API route surfaces it as a 500 with an
-- opaque "failed to create world" message.
--
-- Both functions are SECURITY INVOKER — they run with the caller's
-- permissions and depend on RLS for row-level security. The EXECUTE grant
-- only enables PostgREST to dispatch the call; what actually happens
-- inside is still constrained by the caller's RLS policies.
--
-- We do NOT grant to anon — the worlds and events tables are
-- authenticated-only.

grant execute on function public.create_world_with_event(uuid, text, text, text, text, date) to authenticated;
grant execute on function public.add_event(uuid, text, date, jsonb) to authenticated;

-- Explicit revoke from PUBLIC for principle of least privilege. New roles
-- that get added later won't accidentally inherit RPC access.
revoke execute on function public.create_world_with_event(uuid, text, text, text, text, date) from public;
revoke execute on function public.add_event(uuid, text, date, jsonb) from public;
