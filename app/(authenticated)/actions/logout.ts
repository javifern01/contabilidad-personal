"use server";

/**
 * Logout Server Action (AUTH-04, AUTH-05).
 *
 * Security properties:
 * - Calls auth.api.signOut to DELETE the session row (instant revocation, D-06)
 * - Writes a 'logout' row to auth_audit_log (AUTH-05 success side)
 * - Always redirects to /login — no user-controlled redirect target (ASVS L1 V14: no open-redirect)
 * - Error-tolerant: if signOut throws, the user is still sent to /login
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { recordLoginEvent } from "@/lib/auth-rate-limit";
import { logger } from "@/lib/logger";

function extractIp(hdrs: Headers): string {
  const xff = hdrs.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return hdrs.get("x-real-ip") ?? "0.0.0.0";
}

export async function logoutAction() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  const ip = extractIp(hdrs);
  const userAgent = hdrs.get("user-agent") ?? null;

  try {
    await auth.api.signOut({ headers: hdrs });

    if (session?.user.id) {
      await recordLoginEvent({
        eventType: "logout",
        ip,
        userAgent,
        userId: session.user.id,
      });
    }

    logger.info({ user_id: session?.user.id }, "logout");
  } catch (err: unknown) {
    // Even if signOut throws, send the user back to /login. Log the underlying error.
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "logout_server_error",
    );
  }

  redirect("/login");
}
