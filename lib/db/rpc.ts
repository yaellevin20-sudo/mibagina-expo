import { supabase } from '../supabase';

// -----------------------------------------------------------------------
// RPC return types
// -----------------------------------------------------------------------

export type CoGuardianInfo = {
  guardian_id: string;
  name: string;
  can_see_my_checkins: boolean;
};

export type ChildRow = {
  id: string;
  first_name: string;
  last_name: string;
  age_years: number;
  created_at: string;
  co_guardians: CoGuardianInfo[];
};

export type MyGroupChild = {
  child_id: string;
  first_name: string;
  last_name: string;
};

export type GroupRow = {
  id: string;
  name: string;
  invite_token: string;
  expires_at: string | null;
  created_at: string;
  is_admin: boolean;
  my_children: MyGroupChild[];
  member_count: number;
};

export type GroupMemberChild = {
  child_id: string;
  first_name: string;
  last_name: string;
  age_years: number;
};

export type GroupMember = {
  guardian_id: string;
  name: string;
  is_admin: boolean;
  children: GroupMemberChild[];
};

export type NamedChild = {
  child_id: string;
  first_name: string;
  age_years: number;
};

export type PlaygroundChildrenResult = {
  named: NamedChild[];
  anonymous_ages: number[];
  no_visible_children: boolean;
};

// -----------------------------------------------------------------------
// create_guardian(p_name)
// Creates the guardians row on first login. Idempotent (ON CONFLICT DO NOTHING).
// Gets email from auth.users server-side — not from client.
// -----------------------------------------------------------------------
export async function createGuardian(name: string): Promise<void> {
  const { error } = await supabase.rpc('create_guardian', { p_name: name });
  if (error) throw error;
}

// -----------------------------------------------------------------------
// touch_last_active()
// Returns false if guardian row not found — log, do not treat as error.
// -----------------------------------------------------------------------
export async function touchLastActive(): Promise<boolean> {
  const { data, error } = await supabase.rpc('touch_last_active');
  if (error) throw error;
  return data as boolean;
}

// -----------------------------------------------------------------------
// get_my_children()
// Returns own children with server-computed age_years.
// -----------------------------------------------------------------------
export async function getMyChildren(): Promise<ChildRow[]> {
  const { data, error } = await supabase.rpc('get_my_children');
  if (error) throw error;
  return data as ChildRow[];
}

// -----------------------------------------------------------------------
// add_child(p_first_name, p_last_name, p_date_of_birth) → child id
// -----------------------------------------------------------------------
export async function addChild(
  firstName: string,
  lastName: string,
  dateOfBirth: string  // 'YYYY-MM-DD'
): Promise<string> {
  const { data, error } = await supabase.rpc('add_child', {
    p_first_name:    firstName,
    p_last_name:     lastName,
    p_date_of_birth: dateOfBirth,
  });
  if (error) throw error;
  return data as string;
}

// -----------------------------------------------------------------------
// remove_child(p_child_id)
// -----------------------------------------------------------------------
export async function removeChild(childId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_child', { p_child_id: childId });
  if (error) throw error;
}

// -----------------------------------------------------------------------
// set_co_guardian_visibility(p_child_id, p_to_guardian_id, p_can_see)
// "Can to_guardian see MY check-ins for this child?"
// -----------------------------------------------------------------------
export async function setCoGuardianVisibility(
  childId: string,
  toGuardianId: string,
  canSee: boolean
): Promise<void> {
  const { error } = await supabase.rpc('set_co_guardian_visibility', {
    p_child_id:       childId,
    p_to_guardian_id: toGuardianId,
    p_can_see:        canSee,
  });
  if (error) throw error;
}

// -----------------------------------------------------------------------
// get_my_groups()
// -----------------------------------------------------------------------
export async function getMyGroups(): Promise<GroupRow[]> {
  const { data, error } = await supabase.rpc('get_my_groups');
  if (error) throw error;
  return data as GroupRow[];
}

// -----------------------------------------------------------------------
// create_group(p_name) → group id
// -----------------------------------------------------------------------
export async function createGroup(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', { p_name: name });
  if (error) throw error;
  return data as string;
}

// -----------------------------------------------------------------------
// rename_group(p_group_id, p_name)
// -----------------------------------------------------------------------
export async function renameGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_group', { p_group_id: groupId, p_name: name });
  if (error) throw error;
}

// -----------------------------------------------------------------------
// regenerate_invite_token(p_group_id) → new token
// -----------------------------------------------------------------------
export async function regenerateInviteToken(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('regenerate_invite_token', { p_group_id: groupId });
  if (error) throw error;
  return data as string;
}

// -----------------------------------------------------------------------
// remove_guardian_from_group(p_group_id, p_guardian_id)
// Admin removes another guardian, or self-leave.
// Throws if last admin.
// -----------------------------------------------------------------------
export async function removeGuardianFromGroup(
  groupId: string,
  guardianId: string
): Promise<void> {
  const { error } = await supabase.rpc('remove_guardian_from_group', {
    p_group_id:    groupId,
    p_guardian_id: guardianId,
  });
  if (error) throw error;
}

// -----------------------------------------------------------------------
// remove_child_from_group(p_group_id, p_child_id) — admin only
// -----------------------------------------------------------------------
export async function removeChildFromGroup(
  groupId: string,
  childId: string
): Promise<void> {
  const { error } = await supabase.rpc('remove_child_from_group', {
    p_group_id:  groupId,
    p_child_id:  childId,
  });
  if (error) throw error;
}

// -----------------------------------------------------------------------
// get_group_members(p_group_id)
// -----------------------------------------------------------------------
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase.rpc('get_group_members', { p_group_id: groupId });
  if (error) throw error;
  return data as GroupMember[];
}

// -----------------------------------------------------------------------
// get_playground_children(p_playground_id)
// Three states:
//   data present              → render normally
//   no_visible_children=true  → "No one here right now" (timing race, not error)
//   throws 'Access denied'    → real auth failure, handle separately
// -----------------------------------------------------------------------
export async function getPlaygroundChildren(
  playgroundId: string
): Promise<PlaygroundChildrenResult> {
  const { data, error } = await supabase.rpc('get_playground_children', {
    p_playground_id: playgroundId,
  });
  if (error) throw error;
  return data as PlaygroundChildrenResult;
}
