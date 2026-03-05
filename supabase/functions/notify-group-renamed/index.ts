/**
 * notify-group-renamed
 *
 * Called fire-and-forget by the admin client after successfully renaming a group.
 * Sends a push notification to all group members (excluding the renaming admin).
 *
 * Auth: Bearer JWT from client.
 * Body: { group_id: string, old_name: string, new_name: string }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type MemberToken = {
  guardian_id:     string;
  expo_push_token: string;
};

Deno.serve(async (req: Request) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const jwt = authHeader.slice(7);

  const anonClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
  const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt);
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const caller_id = user.id;

  // ── Parse body ──────────────────────────────────────────────────────────────
  let group_id: string, old_name: string, new_name: string;
  try {
    const body = await req.json();
    group_id = body.group_id;
    old_name = body.old_name;
    new_name = body.new_name;
    if (!group_id || !old_name || !new_name) throw new Error('missing fields');
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // ── Get member push tokens (excludes the renaming admin) ───────────────────
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: members, error: tokensError } = await admin.rpc(
    'get_group_member_tokens',
    { p_group_id: group_id, p_exclude_guardian_id: caller_id }
  );

  if (tokensError) {
    console.error('[notify-group-renamed] get_group_member_tokens error:', tokensError.message);
    return new Response(JSON.stringify({ error: tokensError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Send notifications ──────────────────────────────────────────────────────
  let sent = 0;
  for (const member of (members as MemberToken[] ?? [])) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          to:    member.expo_push_token,
          title: `"${old_name}" שונה ל-"${new_name}"`,
          body:  'שם הקבוצה עודכן',
          data:  { type: 'group_renamed', group_id, old_name, new_name },
          sound: 'default',
        }),
      });
      if (!res.ok) {
        console.error('[notify-group-renamed] Expo push error:', res.status, await res.text());
      } else {
        sent++;
      }
    } catch (e) {
      console.error('[notify-group-renamed] push error for', member.guardian_id, e);
    }
  }

  console.log('[notify-group-renamed] done, notified:', sent);
  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
