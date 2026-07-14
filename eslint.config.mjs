import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/dashboard/**/*.{ts,tsx}"],
    rules: {
      // The migrated Dashboard predates React's compiler-oriented lint rules.
      // Its effects and controller refs are covered by the preserved test suite.
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/dashboard/next-navigation.tsx"],
    rules: {"react-hooks/rules-of-hooks": "off"},
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/attempt-navigation.ts"],
    rules: {"@typescript-eslint/no-explicit-any": "off"},
  },
  globalIgnores([".next/**", ".next-dev/**", "out/**", "build/**", "next-env.d.ts"]),
]);
