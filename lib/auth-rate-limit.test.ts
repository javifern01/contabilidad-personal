/**
 * Integration tests for auth rate-limit logic (D-12).
 *
 * These tests require a live DATABASE_URL (Neon dev branch).
 * They are wrapped in describe.skipIf(!RUN) so CI passes without a DB connection.
 * Run locally with .env.local set.
 */

import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { authAuditLog } from "@/drizzle/schema";

const RUN = !!process.env.DATABASE_URL;

function uniqueIp(): string {
  // Use a 10.x.x.x address with random last two octets per test
  return `10.42.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

async function cleanIp(ip: string) {
  await db.delete(authAuditLog).where(eq(authAuditLog.ip, ip));
}

describe.skipIf(!RUN)("checkRateLimit (D-12)", () => {
  it("0 prior failures → allowed, 5 remaining", async () => {
    const { checkRateLimit } = await import("@/lib/auth-rate-limit");
    const ip = uniqueIp();
    await cleanIp(ip);
    const r = await checkRateLimit(ip);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(5);
    expect(r.retryAfterMin).toBe(0);
  });

  it("4 failures in window → allowed, 1 remaining", async () => {
    const { checkRateLimit, recordLoginEvent } = await import("@/lib/auth-rate-limit");
    const ip = uniqueIp();
    await cleanIp(ip);
    for (let i = 0; i < 4; i++) {
      await recordLoginEvent({ eventType: "login_failure", ip, failureReason: "invalid_password" });
    }
    const r = await checkRateLimit(ip);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
    await cleanIp(ip);
  });

  it("5 failures in window → blocked, retryAfterMin between 1 and 15", async () => {
    const { checkRateLimit, recordLoginEvent } = await import("@/lib/auth-rate-limit");
    const ip = uniqueIp();
    await cleanIp(ip);
    for (let i = 0; i < 5; i++) {
      await recordLoginEvent({ eventType: "login_failure", ip, failureReason: "invalid_password" });
    }
    const r = await checkRateLimit(ip);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterMin).toBeGreaterThanOrEqual(1);
    expect(r.retryAfterMin).toBeLessThanOrEqual(15);
    await cleanIp(ip);
  });

  it("blocked rows count too (mix of failure + blocked)", async () => {
    const { checkRateLimit, recordLoginEvent } = await import("@/lib/auth-rate-limit");
    const ip = uniqueIp();
    await cleanIp(ip);
    for (let i = 0; i < 4; i++) {
      await recordLoginEvent({ eventType: "login_failure", ip, failureReason: "invalid_password" });
    }
    await recordLoginEvent({ eventType: "login_blocked", ip, failureReason: "rate_limited" });
    const r = await checkRateLimit(ip);
    expect(r.allowed).toBe(false);
    await cleanIp(ip);
  });

  it("login_success rows do NOT count toward rate limit", async () => {
    const { checkRateLimit, recordLoginEvent } = await import("@/lib/auth-rate-limit");
    const ip = uniqueIp();
    await cleanIp(ip);
    for (let i = 0; i < 10; i++) {
      await recordLoginEvent({ eventType: "login_success", ip, userId: null });
    }
    const r = await checkRateLimit(ip);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(5);
    await cleanIp(ip);
  });

  it("different IPs do not affect each other", async () => {
    const { checkRateLimit, recordLoginEvent } = await import("@/lib/auth-rate-limit");
    const ipA = uniqueIp();
    const ipB = uniqueIp();
    await cleanIp(ipA);
    await cleanIp(ipB);
    for (let i = 0; i < 5; i++) {
      await recordLoginEvent({ eventType: "login_failure", ip: ipA, failureReason: "invalid_password" });
    }
    const rA = await checkRateLimit(ipA);
    const rB = await checkRateLimit(ipB);
    expect(rA.allowed).toBe(false);
    expect(rB.allowed).toBe(true);
    await cleanIp(ipA);
    await cleanIp(ipB);
  });
});

describe.skipIf(!RUN)("recordLoginEvent", () => {
  it("writes a login_failure row with all fields", async () => {
    const { recordLoginEvent } = await import("@/lib/auth-rate-limit");
    const ip = uniqueIp();
    await cleanIp(ip);
    await recordLoginEvent({
      eventType: "login_failure",
      ip,
      userAgent: "test-agent/1.0",
      failureReason: "invalid_password",
    });
    const rows = await db.select().from(authAuditLog).where(eq(authAuditLog.ip, ip));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventType).toBe("login_failure");
    expect(rows[0]!.userAgent).toBe("test-agent/1.0");
    expect(rows[0]!.failureReason).toBe("invalid_password");
    expect(rows[0]!.userId).toBeNull();
    await cleanIp(ip);
  });

  it("writes a login_blocked row", async () => {
    const { recordLoginEvent } = await import("@/lib/auth-rate-limit");
    const ip = uniqueIp();
    await cleanIp(ip);
    await recordLoginEvent({
      eventType: "login_blocked",
      ip,
      failureReason: "rate_limited",
    });
    const rows = await db.select().from(authAuditLog).where(eq(authAuditLog.ip, ip));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventType).toBe("login_blocked");
    expect(rows[0]!.failureReason).toBe("rate_limited");
    expect(rows[0]!.userId).toBeNull();
    await cleanIp(ip);
  });

  it("writes a login_failure row with null userId and null userAgent", async () => {
    const { recordLoginEvent } = await import("@/lib/auth-rate-limit");
    const ip = uniqueIp();
    await cleanIp(ip);
    await recordLoginEvent({ eventType: "login_failure", ip });
    const rows = await db.select().from(authAuditLog).where(eq(authAuditLog.ip, ip));
    expect(rows[0]!.userId).toBeNull();
    expect(rows[0]!.userAgent).toBeNull();
    await cleanIp(ip);
  });

  it("captures user_agent if provided", async () => {
    const { recordLoginEvent } = await import("@/lib/auth-rate-limit");
    const ip = uniqueIp();
    await cleanIp(ip);
    await recordLoginEvent({
      eventType: "login_failure",
      ip,
      userAgent: "Mozilla/5.0 TestBrowser",
      failureReason: "invalid_password",
    });
    const rows = await db.select().from(authAuditLog).where(eq(authAuditLog.ip, ip));
    expect(rows[0]!.userAgent).toBe("Mozilla/5.0 TestBrowser");
    await cleanIp(ip);
  });
});
