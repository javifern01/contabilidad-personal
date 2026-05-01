import tseslint from "typescript-eslint";
// eslint-config-next ships native flat-config arrays in Next.js 16
// Import them directly instead of using FlatCompat (avoids circular JSON issue)
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default tseslint.config(
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // D-14: no console.log in production. Use lib/logger.ts (Pino).
      // warn/error allowed for genuine dev-debug situations.
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  {
    // Build artifacts and generated migrations are not linted.
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/migrations/**",
      "*.config.mjs",
      "*.config.ts",
      "next-env.d.ts",
    ],
  },
);
