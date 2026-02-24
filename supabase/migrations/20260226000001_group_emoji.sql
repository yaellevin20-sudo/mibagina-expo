-- =============================================================================
-- Group emoji: add emoji column, set_group_emoji RPC, update get_my_groups
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Add emoji column to groups (nullable, no length constraint)
-- ---------------------------------------------------------------------------
alter table groups add column if not exists emoji text;

-- ---------------------------------------------------------------------------
-- set_group_emoji(p_group_id, p_emoji) — admin only
-- Pass null to clear the emoji.
-- ---------------------------------------------------------------------------
create or replace function set_group_emoji(p_group_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_id uuid := auth.uid();
begin
  if v_guardian_id is null then raise exception 'Not authenticated'; end if;

  if not exists(
    select 1 from group_admins
    where group_id = p_group_id and guardian_id = v_guardian_id
  ) then
    raise exception 'Access denied';
  end if;

  update groups set emoji = p_emoji where id = p_group_id;
end;
$$;
revoke execute on function set_group_emoji(uuid, text) from anon;
grant  execute on function set_group_emoji(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Update get_my_groups() to include emoji field
-- Full function body based on latest definition in 20260225000001
-- ---------------------------------------------------------------------------
create or replace function get_my_groups()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null then raise exception 'Not authenticated'; end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id',           g.id,
        'name',         g.name,
        'emoji',        g.emoji,
        'invite_token', g.invite_token,
        'expires_at',   g.expires_at,
        'created_at',   g.created_at,
        'is_admin',     exists(
          select 1 from group_admins ga
          where ga.group_id = g.id and ga.guardian_id = viewer_id
        ),
        'my_children',  coalesce((
          select jsonb_agg(jsonb_build_object(
            'child_id',   c.id,
            'first_name', c.first_name,
            'last_name',  c.last_name
          ) order by c.first_name)
          from guardian_child_groups gcg
          join children c on c.id = gcg.child_id
          where gcg.group_id = g.id and gcg.guardian_id = viewer_id
        ), '[]'::jsonb),
        'member_count', (
          select count(distinct gcg2.guardian_id)
          from guardian_child_groups gcg2
          where gcg2.group_id = g.id
        ),
        'child_count',  (
          select count(distinct gcg3.child_id)
          from guardian_child_groups gcg3
          where gcg3.group_id = g.id
        )
      ) order by g.created_at desc
    ), '[]'::jsonb)
    from groups g
    where (
      exists(select 1 from guardian_child_groups gcg where gcg.group_id = g.id and gcg.guardian_id = viewer_id)
      or exists(select 1 from group_admins ga where ga.group_id = g.id and ga.guardian_id = viewer_id)
    )
    and (g.expires_at is null or g.expires_at >= current_date)
  );
end;
$$;
revoke execute on function get_my_groups() from anon;
grant  execute on function get_my_groups() to authenticated;
