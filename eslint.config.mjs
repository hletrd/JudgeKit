import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Enforce next/image usage: upgrade the default "warn" to "error".
  {
    rules: {
      "@next/next/no-img-element": "error",
    },
  },
  // Allow _-prefixed destructured variables (used to strip fields from objects,
  // e.g. rows.map(({ _total, ...rest }) => rest) in paginated API routes).
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          destructuredArrayIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "jsx-a11y/role-has-required-aria-props": "off",
    },
  },
  {
    files: ["scripts/**/*.{js,cjs,mjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/types/**/*.d.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: [
      "src/components/code/code-surface.tsx",
      "src/app/(dashboard)/dashboard/admin/languages/language-config-table.tsx",
      "src/app/(dashboard)/dashboard/admin/plugins/[id]/plugin-config-client.tsx",
      "src/components/contest/contest-quick-stats.tsx",
      "src/components/exam/countdown-timer.tsx",
      "src/components/lecture/lecture-toolbar.tsx",
      "src/hooks/use-submission-polling.ts",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  // eslint-plugin-react-hooks 7.1 flags these pre-existing patterns that 7.0
  // accepted. Keep the rules on for everything else so new code is checked.
  {
    files: [
      "src/app/(dashboard)/dashboard/admin/api-keys/api-keys-client.tsx",
      "src/app/(dashboard)/dashboard/admin/plugins/chat-logs/chat-logs-client.tsx",
      "src/app/(dashboard)/dashboard/admin/tags/edit-tag-dialog.tsx",
      "src/app/(dashboard)/dashboard/admin/users/edit-user-dialog.tsx",
      "src/app/(dashboard)/dashboard/admin/workers/workers-client.tsx",
      "src/app/(public)/contests/join/contest-join-client.tsx",
      "src/app/(public)/dashboard/_components/candidate-dashboard.tsx",
      "src/app/(public)/problems/create/create-problem-form.tsx",
      "src/components/code/compiler-client.tsx",
      "src/components/contest/access-code-manager.tsx",
      "src/components/contest/analytics-charts.tsx",
      "src/components/contest/code-timeline-panel.tsx",
      "src/components/contest/invite-participants.tsx",
      "src/components/contest/recruiter-candidates-panel.tsx",
      "src/components/contest/recruiting-invitations-panel.tsx",
      "src/components/problem/function-test-case-editor.tsx",
      "src/components/problem/problem-submission-form.tsx",
      "src/components/submissions/_components/comment-section.tsx",
      "src/components/submissions/submission-detail-client.tsx",
      "src/hooks/use-mobile.ts",
      "src/lib/plugins/chat-widget/admin-config.tsx",
      "src/lib/plugins/chat-widget/chat-widget.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
    },
  },
  {
    files: [
      "src/app/api/v1/submissions/[id]/events/route.ts",
      "src/lib/db/export.ts",
      "src/lib/db/import.ts",
      "src/lib/db/migrate.ts",
      "src/lib/plugins/chat-widget/providers.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    ".sisyphus/**",
    "static-site/**",
    "test-results/**",
    "judge-worker-rs/target/**",
    "code-similarity-rs/target/**",
    "rate-limiter-rs/target/**",
    // One-off problem-solving / audit scripts at repo root and .context/tmp.
    // These are not part of the production codebase; lint coverage adds noise
    // without value.
    "add-stress-tests.mjs",
    "auto-solver.mjs",
    "dedup-problems.mjs",
    "fetch-problems.mjs",
    "gen_test_cases.mjs",
    "solve-all.mjs",
    "solve-all2.mjs",
    "solve-fixes.mjs",
    "solve-problems.mjs",
    "stress-tests.mjs",
    "submit.mjs",
    "verify-problems.mjs",
    ".context/**",
    "playwright.visual.config.ts",
  ]),
]);

export default eslintConfig;
