import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const withoutLegacyReactRules = (configs) =>
  configs.map((config) => ({
    ...config,
    rules: Object.fromEntries(
      Object.entries(config.rules || {}).filter(([ruleName]) => !ruleName.startsWith("react/"))
    ),
  }));

const eslintConfig = defineConfig([
  ...withoutLegacyReactRules(nextVitals),
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
