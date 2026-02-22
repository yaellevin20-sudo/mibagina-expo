-- ==========================================================================
-- Phase 7: Home screen + Playground view RPCs
-- ==========================================================================

-- ==========================================================================
-- Update get_playground_children to include posted_by in the named array.
-- This allows client-side sibling grouping (same posted_by = siblings).
-- ==========================================================================
create or replace function get_playground_children(p_playground_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer_id uuid := auth.uid();
  named_arr jsonb;
  anon_arr  jsonb;
begin
  if viewer_id is null then raise exception 'Not authenticated'; end if;

  if not exists (
    select 1
    from check_ins ci
    join guardian_child_groups gcg_child  on gcg_child.child_id    = ci.child_id
    join guardian_child_groups gcg_viewer on gcg_viewer.group_id   = gcg_child.group_id
                                         and gcg_viewer.guardian_id = viewer_id
    where ci.playground_id = p_playground_id
  ) then
    raise exception 'Access denied';
  end if;

  -- Named: active, group overlap, visibility allows. DISTINCT ON for race window.
  select coalesce(jsonb_agg(row_data), '[]'::jsonb) into named_arr
  from (
    select distinct on (ci.child_id)
      jsonb_build_object(
        'child_id',   c.id,
        'first_name', c.first_name,
        'age_years',  extract(year from age(c.date_of_birth))::int,
        'posted_by',  ci.posted_by
      ) as row_data
    from check_ins ci
    join children c on c.id = ci.child_id
    where ci.playground_id = p_playground_id
      and ci.expires_at > now()
      and ci.status != 'expired'
      and c.id in (
        select child_id from guardian_child_groups
        where group_id in (
          select group_id from guardian_child_groups where guardian_id = viewer_id
        )
      )
      and not exists (
        select 1 from co_guardian_visibility cgv
        where cgv.child_id         = ci.child_id
          and cgv.from_guardian_id = ci.posted_by
          and cgv.to_guardian_id   = viewer_id
          and cgv.can_see_checkins = false
      )
    order by ci.child_id, ci.checked_in_at desc
  ) subq;

  -- Anonymous: active, no group overlap or hidden by co_guardian_visibility.
  select coalesce(jsonb_agg(age_val), '[]'::jsonb) into anon_arr
  from (
    select distinct on (ci.child_id)
      extract(year from age(c.date_of_birth))::int as age_val
    from check_ins ci
    join children c on c.id = ci.child_id
    where ci.playground_id = p_playground_id
      and ci.expires_at > now()
      and ci.status != 'expired'
      and (
        c.id not in (
          select child_id from guardian_child_groups
          where group_id in (
            select group_id from guardian_child_groups where guardian_id = viewer_id
          )
        )
        or exists (
          select 1 from co_guardian_visibility cgv
          where cgv.child_id         = ci.child_id
            and cgv.from_guardian_id = ci.posted_by
            and cgv.to_guardian_id   = viewer_id
            and cgv.can_see_checkins = false
        )
      )
    order by ci.child_id, ci.checked_in_at desc
  ) subq;

  return jsonb_build_object(
    'named',               named_arr,
    'anonymous_ages',      anon_arr,
    'no_visible_children', (jsonb_array_length(named_arr) = 0
                            and jsonb_array_length(anon_arr) = 0)
  );
end;
$$;
revoke execute on function get_playground_children(uuid) from anon;
grant  execute on function get_playground_children(uuid) to authenticated;

-- ==========================================================================
-- get_group_active_checkins(p_group_id uuid) → jsonb
-- Returns active check-ins for children in the group, grouped by playground.
-- co_guardian_visibility enforced: hidden check-ins appear as anonymous_ages.
-- DISTINCT ON (child_id) guards against the concurrent-insert race window.
-- Returns [] if no active check-ins.
-- Throws 'Access denied' if viewer is not in the group.
-- ==========================================================================
create or replace function get_group_active_checkins(p_group_id uuid)
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
    select 1 from guardian_child_groups
    where group_id = p_group_id and guardian_id = viewer_id
    union all
    select 1 from group_admins
    where group_id = p_group_id and guardian_id = viewer_id
  ) then
    raise exception 'Access denied';
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'playground_id',   pg.id,
          'playground_name', pg.name,
          'named',           named_agg.rows,
          'anonymous_ages',  anon_agg.ages
        )
      ),
      '[]'::jsonb
    )
    from (
      select distinct ci.playground_id
      from check_ins ci
      where ci.expires_at > now()
        and ci.status != 'expired'
        and ci.child_id in (
          select child_id from guardian_child_groups where group_id = p_group_id
        )
    ) active_pg
    join playgrounds pg on pg.id = active_pg.playground_id
    cross join lateral (
      -- Named: visible to viewer
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'child_id',    t.child_id,
            'first_name',  t.first_name,
            'age_years',   t.age_years,
            'check_in_id', t.check_in_id,
            'posted_by',   t.posted_by
          )
        ),
        '[]'::jsonb
      ) as rows
      from (
        select distinct on (ci.child_id)
          ci.child_id,
          ch.first_name,
          extract(year from age(ch.date_of_birth))::int as age_years,
          ci.id                                         as check_in_id,
          ci.posted_by
        from check_ins ci
        join children ch on ch.id = ci.child_id
        where ci.playground_id = active_pg.playground_id
          and ci.expires_at > now()
          and ci.status != 'expired'
          and ci.child_id in (
            select child_id from guardian_child_groups where group_id = p_group_id
          )
          and not exists (
            select 1 from co_guardian_visibility cgv
            where cgv.child_id         = ci.child_id
              and cgv.from_guardian_id = ci.posted_by
              and cgv.to_guardian_id   = viewer_id
              and cgv.can_see_checkins = false
          )
        order by ci.child_id, ci.checked_in_at desc
      ) t
    ) named_agg
    cross join lateral (
      -- Anonymous: hidden by co_guardian_visibility
      select coalesce(
        jsonb_agg(t.age_val),
        '[]'::jsonb
      ) as ages
      from (
        select distinct on (ci.child_id)
          extract(year from age(ch.date_of_birth))::int as age_val
        from check_ins ci
        join children ch on ch.id = ci.child_id
        where ci.playground_id = active_pg.playground_id
          and ci.expires_at > now()
          and ci.status != 'expired'
          and ci.child_id in (
            select child_id from guardian_child_groups where group_id = p_group_id
          )
          and exists (
            select 1 from co_guardian_visibility cgv
            where cgv.child_id         = ci.child_id
              and cgv.from_guardian_id = ci.posted_by
              and cgv.to_guardian_id   = viewer_id
              and cgv.can_see_checkins = false
          )
        order by ci.child_id, ci.checked_in_at desc
      ) t
    ) anon_agg
  );
end;
$$;
revoke execute on function get_group_active_checkins(uuid) from anon;
grant  execute on function get_group_active_checkins(uuid) to authenticated;
