-- ---------------------------------------------------------------------------
-- demote_admin(p_group_id, p_guardian_id)
-- An admin demotes another admin (or themselves) to a regular member.
-- They remain in the group; only their group_admins row is removed.
-- ---------------------------------------------------------------------------
create or replace function demote_admin(p_group_id uuid, p_guardian_id uuid)
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

  -- Caller must be an admin
  if not exists (
    select 1 from group_admins where group_id = p_group_id and guardian_id = v_caller
  ) then
    raise exception 'Not an admin of this group';
  end if;

  -- Target must be an admin
  if not exists (
    select 1 from group_admins where group_id = p_group_id and guardian_id = p_guardian_id
  ) then
    raise exception 'Target is not an admin of this group';
  end if;

  -- Block if this would leave the group with no admins
  select count(*) into v_admin_count
  from group_admins where group_id = p_group_id;

  if v_admin_count <= 1 then
    raise exception 'Cannot demote the last admin';
  end if;

  delete from group_admins
  where group_id = p_group_id and guardian_id = p_guardian_id;
end;
$$;

revoke execute on function demote_admin(uuid, uuid) from anon;
grant  execute on function demote_admin(uuid, uuid) to authenticated;
