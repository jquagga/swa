import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  // Build / generated output (mirrors .prettierignore).
  {
    ignores: [
      ".svelte-kit/**",
      "build/**",
      "coverage/**",
      ".wrangler/**",
      ".output/**",
      "src/lib/paraglide/**",
      "src/worker-configuration.d.ts",
      "worker-configuration.d.ts",
      "project.inlang/cache/**",
      ".agents/**",
      ".opencode/**",
    ],
  },
  js.configs.recommended,
  // Non-type-checked: no projectService, so the TS 6.x toolchain
  // (pinned for svelte-check 4) can't break linting.
  ...tseslint.configs.recommended,
  ...svelte.configs["flat/recommended"],
  // Last: turn off stylistic rules that conflict with Prettier.
  prettier,
  ...svelte.configs["flat/prettier"],
  {
    // The Svelte base config claims *.svelte + *.svelte.ts with
    // svelte-eslint-parser but no sub-parser, so TS syntax (inline
    // `type` imports, annotations) fails to parse. Point the embedded
    // script parser at typescript-eslint (non-type-checked: safe with
    // the pinned TS 6.x toolchain).
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Core no-undef doesn't understand TS types or Svelte rune macros
    // in .svelte files (false positives on `as PermissionName`, $state…);
    // svelte-check (strict tsc) covers genuinely undefined references.
    files: ["**/*.svelte"],
    rules: { "no-undef": "off" },
  },
  {
    // Typed service-worker.ts is excluded from svelte-check but still
    // linted here with ServiceWorker globals (clients, skipWaiting…).
    files: ["src/service-worker.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
);
