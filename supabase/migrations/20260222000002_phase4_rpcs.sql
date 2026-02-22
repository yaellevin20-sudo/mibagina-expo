-- =============================================================================
-- Phase 4: Children tab + Groups tab RPCs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Update get_my_children() to include co-guardian data for child cards
-- ---------------------------------------------------------------------------
create or replace function get_my_children()
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
        'id',           c.id,
        'first_name',   c.first_name,
        'last_name',    c.last_name,
        'age_years',    extract(year from age(c.date_of_birth))::int,
        'created_at',   c.created_at,
        'co_guardians', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'guardian_id',        g.id,
              'name',               g.name,
              -- can_see_my_checkins: whether this co-guardian can see MY check-ins for this child
              'can_see_my_checkins', coalesce(cgv.can_see_checkins, true)
            ) order by g.name
          )
          from guardian_children gc2
          join guardians g on g.id = gc2.guardian_id
          left join co_guardian_visibility cgv
            on cgv.child_id         = c.id
            and cgv.from_guardian_id = viewer_id
            and cgv.to_guardian_id   = g.id
          where gc2.child_id    = c.id
            and gc2.guardian_id != viewer_id
        ), '[]'::jsonb)
      ) order by c.first_name
    ), '[]'::jsonb)
    from children c
    join guardian_children gc on gc.child_id = c.id
    where gc.guardian_id = viewer_id
  );
end;
$$;
revoke execute on function get_my_children() from anon;
grant  execute on function get_my_children() to authenticated;

-- ---------------------------------------------------------------------------
-- add_child(p_first_name, p_last_name, p_date_of_birth)
-- Atomic: inserts children + guardian_children + co_guardian_visibility rows
-- for all existing co-guardians (guardians who share groups with current guardian).
-- ---------------------------------------------------------------------------
create or replace function add_child(
  p_first_name    text,
  p_last_name     text,
  p_date_of_birth date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_id uuid := auth.uid();
  v_child_id    uuid;
begin
  if v_guardian_id is null then raise exception 'Not authenticated'; end if;
  if trim(p_first_name) = '' then raise exception 'First name cannot be empty'; end if;
  if trim(p_last_name)  = '' then raise exception 'Last name cannot be empty'; end if;
  if p_date_of_birth > current_date then raise exception 'Date of birth cannot be in the future'; end if;

  insert into children (first_name, last_name, date_of_birth, created_by_guardian_id)
  values (trim(p_first_name), trim(p_last_name), p_date_of_birth, v_guardian_id)
  returning id into v_child_id;

  insert into guardian_children (guardian_id, child_id)
  values (v_guardian_id, v_child_id)
  on conflict do nothing;

  -- from ME → existing co-guardians (they can see MY check-ins for this child)
  insert into co_guardian_visibility (child_id, from_guardian_id, to_guardian_id, can_see_checkins)
  select distinct v_child_id, v_guardian_id, gcg_other.guardian_id, true
  from guardian_child_groups gcg_mine
  join guardian_child_groups gcg_other
    on gcg_other.group_id    = gcg_mine.group_id
   and gcg_other.guardian_id != v_guardian_id
  where gcg_mine.guardian_id = v_guardian_id
  on conflict do nothing;

  -- from co-guardians → ME (I can see THEIR check-ins for this child)
  insert into co_guardian_visibility (child_id, from_guardian_id, to_guardian_id, can_see_checkins)
  select distinct v_child_id, gcg_other.guardian_id, v_guardian_id, true
  from guardian_child_groups gcg_mine
  join guardian_child_groups gcg_other
    on gcg_other.group_id    = gcg_mine.group_id
   and gcg_other.guardian_id != v_guardian_id
  where gcg_mine.guardian_id = v_guardian_id
  on conflict do nothing;

  return v_child_id;
end;
$$;
revoke execute on function add_child(text, text, date) from anon;
grant  execute on function add_child(text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_child(p_child_id)
-- Atomic: delete guardian_children (cascades guardian_child_groups),
-- co_guardian_visibility rows for this guardian+child, then orphan-check.
-- ---------------------------------------------------------------------------
create or replace function remove_child(p_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_id uuid := auth.uid();
begin
  if v_guardian_id is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from guardian_children
    where guardian_id = v_guardian_id and child_id = p_child_id
  ) then
    raise exception 'Child not found';
  end if;

  -- Remove visibility rows involving this guardian for this child
  delete from co_guardian_visibility
  where child_id = p_child_id
    and (from_guardian_id = v_guardian_id or to_guardian_id = v_guardian_id);

  -- Delete guardian_children — cascades to guardian_child_groups
  delete from guardian_children
  where guardian_id = v_guardian_id and child_id = p_child_id;

  -- Orphan check: if no guardian_children rows remain, delete the child
  if not exists (select 1 from guardian_children where child_id = p_child_id) then
    delete from children where id = p_child_id;
  end if;
end;
$$;
revoke execute on function remove_child(uuid) from anon;
grant  execute on function remove_child(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- set_co_guardian_visibility(p_child_id, p_to_guardian_id, p_can_see)
-- Upserts can_see_checkins for (from=current_guardian, to=p_to_guardian_id).
-- "Can p_to_guardian_id see MY check-ins for p_child_id?"
-- ---------------------------------------------------------------------------
create or replace function set_co_guardian_visibility(
  p_child_id       uuid,
  p_to_guardian_id uuid,
  p_can_see        boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if auth.uid() = p_to_guardian_id then raise exception 'Cannot set visibility for yourself'; end if;

  if not exists (
    select 1 from guardian_children
    where guardian_id = auth.uid() and child_id = p_child_id
  ) then
    raise exception 'Child not found';
  end if;

  insert into co_guardian_visibility (child_id, from_guardian_id, to_guardian_id, can_see_checkins)
  values (p_child_id, auth.uid(), p_to_guardian_id, p_can_see)
  on conflict (child_id, from_guardian_id, to_guardian_id)
  do update set can_see_checkins = p_can_see;
end;
$$;
revoke execute on function set_co_guardian_visibility(uuid, uuid, boolean) from anon;
grant  execute on function set_co_guardian_visibility(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- get_my_groups()
-- Returns groups where guardian is in guardian_child_groups OR group_admins.
-- Active = expires_at IS NULL OR expires_at >= current_date.
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

-- ---------------------------------------------------------------------------
-- create_group(p_name)
-- Inserts groups + group_admins + guardian_group_settings. All ON CONFLICT DO NOTHING.
-- Returns new group id.
-- ---------------------------------------------------------------------------
create or replace function create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_id uuid := auth.uid();
  v_group_id    uuid;
begin
  if v_guardian_id is null then raise exception 'Not authenticated'; end if;
  if trim(p_name) = '' then raise exception 'Group name cannot be empty'; end if;

  insert into groups (name)
  values (trim(p_name))
  returning id into v_group_id;

  insert into group_admins (group_id, guardian_id)
  values (v_group_id, v_guardian_id)
  on conflict do nothing;

  insert into guardian_group_settings (guardian_id, group_id)
  values (v_guardian_id, v_group_id)
  on conflict do nothing;

  return v_group_id;
end;
$$;
revoke execute on function create_group(text) from anon;
grant  execute on function create_group(text) to authenticated;

-- ---------------------------------------------------------------------------
-- rename_group(p_group_id, p_name) — admin only
-- ---------------------------------------------------------------------------
create or replace function rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if trim(p_name) = '' then raise exception 'Group name cannot be empty'; end if;

  if not exists (
    select 1 from group_admins
    where group_id = p_group_id and guardian_id = auth.uid()
  ) then
    raise exception 'Access denied';
  end if;

  update groups set name = trim(p_name) where id = p_group_id;
end;
$$;
revoke execute on function rename_group(uuid, text) from anon;
grant  execute on function rename_group(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- regenerate_invite_token(p_group_id) — admin only
-- Atomic single UPDATE. Old token invalid on commit. Returns new token.
-- ---------------------------------------------------------------------------
create or replace function regenerate_invite_token(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_token text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from group_admins
    where group_id = p_group_id and guardian_id = auth.uid()
  ) then
    raise exception 'Access denied';
  end if;

  update groups
  set invite_token = gen_random_uuid()::text
  where id = p_group_id
  returning invite_token into v_new_token;

  return v_new_token;
end;
$$;
revoke execute on function regenerate_invite_token(uuid) from anon;
grant  execute on function regenerate_invite_token(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_guardian_from_group(p_group_id, p_guardian_id)
-- Admin can remove any guardian. Guardian can self-leave.
-- Blocks if target is the last admin.
-- Steps: check last-admin → delete guardian_child_groups → delete settings → delete admin row
-- ---------------------------------------------------------------------------
create or replace function remove_guardian_from_group(p_group_id uuid, p_guardian_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller      uuid := auth.uid();
  v_admin_count int;
begin
  if v_caller is null then raise exception 'Not authenticated'; end if;

  -- Must be admin OR self-leave
  if v_caller != p_guardian_id then
    if not exists (
      select 1 from group_admins
      where group_id = p_group_id and guardian_id = v_caller
    ) then
      raise exception 'Access denied';
    end if;
  end if;

  -- Block if removing the last admin
  if exists (
    select 1 from group_admins
    where group_id = p_group_id and guardian_id = p_guardian_id
  ) then
    select count(*) into v_admin_count
    from group_admins where group_id = p_group_id;

    if v_admin_count <= 1 then
      raise exception 'Cannot remove the last admin — assign another admin first';
    end if;
  end if;

  -- 1. guardian_child_groups (cascade from guardian_children FK not applicable here;
  --    delete explicitly since we're removing from a specific group)
  delete from guardian_child_groups
  where group_id = p_group_id and guardian_id = p_guardian_id;

  -- 2. guardian_group_settings
  delete from guardian_group_settings
  where group_id = p_group_id and guardian_id = p_guardian_id;

  -- 3. group_admins (if present)
  delete from group_admins
  where group_id = p_group_id and guardian_id = p_guardian_id;
end;
$$;
revoke execute on function remove_guardian_from_group(uuid, uuid) from anon;
grant  execute on function remove_guardian_from_group(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- remove_child_from_group(p_group_id, p_child_id) — admin only
-- Removes a child from a group (guardian_child_groups rows only, not the child itself).
-- ---------------------------------------------------------------------------
create or replace function remove_child_from_group(p_group_id uuid, p_child_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from group_admins
    where group_id = p_group_id and guardian_id = auth.uid()
  ) then
    raise exception 'Access denied';
  end if;

  delete from guardian_child_groups
  where group_id = p_group_id and child_id = p_child_id;
end;
$$;
revoke execute on function remove_child_from_group(uuid, uuid) from anon;
grant  execute on function remove_child_from_group(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_group_members(p_group_id)
-- Caller must belong to the group. Returns all members with their children in the group.
-- ---------------------------------------------------------------------------
create or replace function get_group_members(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
begin
  if viewer_id is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1 from guardian_child_groups where group_id = p_group_id and guardian_id = viewer_id
  ) and not exists (
    select 1 from group_admins where group_id = p_group_id and guardian_id = viewer_id
  ) then
    raise exception 'Access denied';
  end if;

  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'guardian_id', g.id,
        'name',        g.name,
        'is_admin',    exists(
          select 1 from group_admins ga
          where ga.group_id = p_group_id and ga.guardian_id = g.id
        ),
        'children',    coalesce((
          select jsonb_agg(jsonb_build_object(
            'child_id',   c.id,
            'first_name', c.first_name,
            'last_name',  c.last_name,
            'age_years',  extract(year from age(c.date_of_birth))::int
          ) order by c.first_name)
          from guardian_child_groups gcg
          join children c on c.id = gcg.child_id
          where gcg.group_id = p_group_id and gcg.guardian_id = g.id
        ), '[]'::jsonb)
      ) order by g.name
    ), '[]'::jsonb)
    from guardians g
    where g.id in (
      select distinct guardian_id from guardian_child_groups where group_id = p_group_id
      union
      select guardian_id from group_admins where group_id = p_group_id
    )
  );
end;
$$;
revoke execute on function get_group_members(uuid) from anon;
grant  execute on function get_group_members(uuid) to authenticated;
