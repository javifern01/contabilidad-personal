/**
 * Postgres-window rate-limit reading auth_audit_log (D-12).
 *
 * Uses the partial index `auth_audit_log_ip_failure_idx` on (ip, occurred_at DESC)
 * WHERE event_type IN ('login_failure', 'login_blocked'), so the window count is O(log n).
 *
 * No Redis / KV vendor at Phase 1 — single user, low traffic, the DB is the right tool.
 */

import { and, eq, gte, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { authAuditLog } from "@/drizzle/schema";
import type { NewAuthAuditLogRow } from "@/drizzle/schema";

export interface RateLimitResult {
  /** Whether the login attempt is allowed to proceed. */
  allowed: boolean;
  /** Events remaining within the 15-min window before block kicks in. */
  remaining: number;
  /** 0 if allowed; else minutes until oldest event ages out of the window. */
  retryAfterMin: number;
}

const WINDOW_MIN = 15;
const MAX_FAILURES = 5;

/**
 * Check the rate-limit for a given IP address.
 *
 * Queries auth_audit_log for failure/blocked events in the last 15 minutes.
 * If >= MAX_FAILURES events are found, the request is denied.
 */
export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - WINDOW_MIN * 60_000);

  const rows = await db
    .select({ occurredAt: authAuditLog.occurredAt })
    .from(authAuditLog)
    .where(
      and(
        eq(authAuditLog.ip, ip),
        gte(authAuditLog.occurredAt, windowStart),
        inArray(authAuditLog.eventType, ["login_failure", "login_blocked"]),
      ),
    )
    .orderBy(desc(authAuditLog.occurredAt))
    .limit(MAX_FAILURES + 1);

  const count = rows.length;
  if (count < MAX_FAILURES) {
    return { allowed: true, remaining: MAX_FAILURES - count, retryAfterMin: 0 };
  }

  // count >= MAX_FAILURES — denied.
  // retryAfterMin = ceil( (oldest_of_5 + 15min - now) / 60000 )
  // rows are ordered DESC, so the 5th most-recent is rows[MAX_FAILURES - 1].
  const oldestRelevant = rows[MAX_FAILURES - 1]!.occurredAt;
  const ageOutMs = oldestRelevant.getTime() + WINDOW_MIN * 60_000 - Date.now();
  const retryAfterMin = Math.max(1, Math.ceil(ageOutMs / 60_000));

  return { allowed: false, remaining: 0, retryAfterMin };
}

export type LoginEventInput = Omit<NewAuthAuditLogRow, "id" | "occurredAt">;

/**
 * Write an auth audit log event.
 *
 * Called on every login outcome: success, failure, blocked, or logout.
 * Append-only: no UPDATE or DELETE in application code.
 */
export async function recordLoginEvent(event: LoginEventInput): Promise<void> {
  await db.insert(authAuditLog).values(event);
}
