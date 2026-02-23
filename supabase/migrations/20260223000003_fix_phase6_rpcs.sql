-- Fix two bugs in Phase 6 RPCs:
--
-- Bug 1: session_id leaked in session_token
--   post_checkin and get_pending_prompts built the token as
--   "session_id.hmac_hex", embedding the raw session_id UUID in plaintext.
--   The comment claimed "session_id is NEVER included" but was wrong.
--   Fix: use the HMAC alone as the opaque token (no session_id prefix).
--
-- Bug 2: get_pending_prompts missing expires_at filter
--   Spec invariant: "Always filter check-ins by BOTH expires_at > now()
--   AND status != 'expired'". The outer query and lateral join only
--   checked status = 'active', creating a window where prompts were sent
--   for check-ins that had expired but hadn't been cleaned up yet.
--   Fix: add expires_at > now() to both query locations.

-- ── post_checkin ──────────────────────────────────────────────────────────────
create or replace function post_checkin(
  p_child_ids     uuid[],
  p_playground_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_id   uuid := auth.uid();
  v_session_id    uuid := gen_random_uuid();
  v_session_token text;
  v_owned_count   int;
  v_child_id      uuid;
  v_checkin_id    uuid;
  v_result_arr    jsonb := '[]'::jsonb;
begin
  if v_guardian_id is null then raise exception 'Not authenticated'; end if;

  if p_child_ids is null or array_length(p_child_ids, 1) is null then
    raise exception 'No children specified';
  end if;

  -- Verify guardian owns ALL requested children
  select count(*) into v_owned_count
  from guardian_children
  where guardian_id = v_guardian_id
    and child_id    = any(p_child_ids);

  if v_owned_count <> array_length(p_child_ids, 1) then
    raise exception 'Invalid children';
  end if;

  -- Verify playground exists
  if not exists (select 1 from playgrounds where id = p_playground_id) then
    raise exception 'Invalid playground';
  end if;

  -- Insert one check_in row per child.
  -- Triggers enforce: daily limit (10/day) and single active check-in per child.
  foreach v_child_id in array p_child_ids loop
    insert into check_ins (
      child_id, playground_id, posted_by, session_id,
      checked_in_at, expires_at
    ) values (
      v_child_id, p_playground_id, v_guardian_id, v_session_id,
      now(), now() + interval '1 hour'
    ) returning id into v_checkin_id;

    v_result_arr := v_result_arr || jsonb_build_object(
      'id',       v_checkin_id,
      'child_id', v_child_id
    );
  end loop;

  -- Derive session_token: opaque HMAC-SHA256 of session_id.
  -- session_id is NOT embedded in the token — the HMAC alone is the token.
  -- The client receives this token for "Still There?" context but never
  -- forwards it to RPCs (which authenticate via JWT instead).
  v_session_token :=
    encode(
      extensions.hmac(v_session_id::text, _app_session_secret(), 'sha256'),
      'hex'
    );

  return jsonb_build_object(
    'session_token', v_session_token,
    'check_ins',     v_result_arr
  );
end;
$$;
revoke execute on function post_checkin(uuid[], uuid) from anon;
grant  execute on function post_checkin(uuid[], uuid) to authenticated;

-- ── get_pending_prompts ───────────────────────────────────────────────────────
create or replace function get_pending_prompts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'session_id',   s.session_id,
          'session_token',
            encode(
              extensions.hmac(s.session_id::text, _app_session_secret(), 'sha256'),
              'hex'
            ),
          'guardian_id',      s.guardian_id,
          'expo_push_token',  g.expo_push_token,
          'check_ins',        ci_agg.rows
        )
      ),
      '[]'::jsonb
    )
    from (
      select distinct session_id, posted_by as guardian_id
      from check_ins
      where status                  = 'active'
        and expires_at              > now()          -- spec invariant
        and checked_in_at           <= now() - interval '45 minutes'
        and still_there_prompted_at is null
    ) s
    join guardians g on g.id = s.guardian_id
    cross join lateral (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'check_in_id', ci.id,
            'first_name',  ch.first_name,
            'age_years',   extract(year from age(ch.date_of_birth))::int
          )
        ),
        '[]'::jsonb
      ) as rows
      from check_ins ci
      join children ch on ch.id = ci.child_id
      where ci.session_id              = s.session_id
        and ci.status                  = 'active'
        and ci.expires_at              > now()       -- spec invariant
        and ci.still_there_prompted_at is null
    ) ci_agg
  );
end;
$$;
revoke execute on function get_pending_prompts() from anon, authenticated;
grant  execute on function get_pending_prompts() to service_role;
