"use server";

/**
 * Login Server Action — validates input, applies IP rate-limit (D-12) BEFORE
 * password verification, then delegates to Better Auth signInEmail.
 *
 * Security properties:
 * - Rate-limit check BEFORE password compare (timing-attack mitigation + DoS protection)
 * - Generic error copy ("Credenciales inválidas.") for both unknown email and wrong password
 *   (ASVS L1 V2: prevents user enumeration)
 * - All outcomes written to auth_audit_log (success/failure/blocked)
 * - "next" param sanitised to prevent open-redirect (ASVS L1 V14)
 */

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkRateLimit, recordLoginEvent } from "@/lib/auth-rate-limit";
import { logger } from "@/lib/logger";

const loginSchema = z.object({
  email: z.string().email({ message: "Correo electrónico no válido." }).max(256),
  password: z.string().min(1, { message: "La contraseña es obligatoria." }).max(512),
  next: z.string().optional(), // post-login redirect path
});

export type LoginActionResult =
  | { ok: true }
  | { ok: false; kind: "validation"; fieldErrors: Record<string, string[]> }
  | { ok: false; kind: "credentials" }
  | { ok: false; kind: "rate_limited"; retryAfterMin: number }
  | { ok: false; kind: "server_error" };

export async function loginAction(formData: FormData): Promise<LoginActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { email, password, next } = parsed.data;
  const hdrs = await headers();
  const ip = extractIp(hdrs);
  const userAgent = hdrs.get("user-agent") ?? null;

  // 1. Rate-limit BEFORE password verification (timing-attack mitigation + DoS protection).
  const rl = await checkRateLimit(ip);
  if (!rl.allowed) {
    await recordLoginEvent({ eventType: "login_blocked", ip, userAgent, failureReason: "rate_limited" });
    logger.warn({ ip }, "login_blocked");
    return { ok: false, kind: "rate_limited", retryAfterMin: rl.retryAfterMin };
  }

  // 2. Better Auth signInEmail — the nextCookies plugin in lib/auth.ts ensures the
  //    session cookie is applied via next/headers cookies() during this Server Action.
  try {
    const res = await auth.api.signInEmail({
      body: { email, password },
      headers: hdrs,
      asResponse: true,
    });

    if (!res.ok) {
      // Generic credentials error — never reveal whether email or password was wrong (V2 ASVS L1).
      await recordLoginEvent({
        eventType: "login_failure",
        ip,
        userAgent,
        failureReason: "invalid_password",
      });
      logger.info({ ip }, "login_failure");
      return { ok: false, kind: "credentials" };
    }

    // 3. Session cookie set via nextCookies plugin. Read session to get user ID for audit log.
    const session = await auth.api.getSession({ headers: hdrs });
    await recordLoginEvent({
      eventType: "login_success",
      ip,
      userAgent,
      userId: session?.user.id ?? null,
    });
    logger.info({ user_id: session?.user.id }, "login_success");
  } catch (err: unknown) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "login_server_error",
    );
    return { ok: false, kind: "server_error" };
  }

  // 4. Redirect to next (validated for safety) or home.
  //    Must start with "/" and not "//" (open-redirect defense per ASVS L1 V14).
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  redirect(safeNext);
}

/**
 * Extract the real client IP from Vercel proxy headers.
 * x-forwarded-for contains comma-separated IPs — take the first (the client).
 * Falls back to x-real-ip, then to "0.0.0.0".
 */
function extractIp(hdrs: Headers): string {
  const xff = hdrs.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return hdrs.get("x-real-ip") ?? "0.0.0.0";
}
