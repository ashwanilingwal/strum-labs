import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/**
 * The right to erasure, as one request. The caller is identified by their
 * own session cookie; the deletion itself needs the service-role key, which
 * only this server holds. Removing the auth user cascades to strum_state
 * (see supabase/schema.sql), but the row is deleted first anyway so a
 * half-failed request never leaves practice data behind an orphaned id.
 *
 * 501 rather than 500 when the service key is missing: the client turns
 * that into "not set up on this server, email us" instead of "try again".
 */
export async function POST() {
  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.json({ error: "unconfigured" }, { status: 501 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no_service_key" }, { status: 501 });

  const row = await admin.from("strum_state").delete().eq("user_id", user.id);
  if (row.error) return NextResponse.json({ error: "state" }, { status: 500 });

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "user" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
