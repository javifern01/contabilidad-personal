import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().min(1, "DATABASE_URL is required"),
  ENCRYPTION_KEY: z
    .string()
    .min(1, "ENCRYPTION_KEY is required (32 bytes base64-encoded)")
    .refine(
      (val) => {
        try {
          const decoded = Buffer.from(val, "base64");
          return decoded.byteLength === 32;
        } catch {
          return false;
        }
      },
      {
        message:
          "ENCRYPTION_KEY must be exactly 32 bytes after base64 decoding. Generate with: openssl rand -base64 32",
      },
    ),
  BETTER_AUTH_SECRET: z.string().min(32).optional(), // populated by plan 06
  BETTER_AUTH_URL: z.string().url().optional(), // populated by plan 06
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // No-console rule (D-14): use process.stderr directly. lib/logger.ts must not be imported here
    // (logger may import env in its own bootstrap — avoid circular dependency).
    process.stderr.write(
      `[env] Invalid environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}\n`,
    );
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}

export const env: Env = loadEnv();
