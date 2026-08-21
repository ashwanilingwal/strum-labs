import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * OAuth landing point. Exchanges the code for a session, then sends the
 * player back to the one screen this app has.
 *
 * `origin` is not trusted directly: behind a proxy (Vercel, a tunnel) the
 * request's own origin is the internal one, so the redirect would land on an
 * unreachable host. The forwarded headers are what the browser actually used.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  const base = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin;

  if (!code) return NextResponse.redirect(`${base}/?auth=missing_code`);

  const supabase = await supabaseServer();
  if (!supabase) return NextResponse.redirect(`${base}/?auth=unconfigured`);

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${base}/?auth=failed`);

  return NextResponse.redirect(`${base}/?auth=ok`);
}
