const { builtinModules } = require("module");

const ALLOWED_NODE_BUILTINS = new Set(["assert"]);

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    sourceType: "module",
    project: "tsconfig.json",
  },
  plugins: ["@typescript-eslint", "deprecation"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  rules: {
    "no-console": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-unused-expressions": "error",
    "prefer-const": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "deprecation/deprecation": "warn",
    "object-shorthand": ["error", "always"],
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
  },
  overrides: [
    {
      files: [
        "lib/temporal/workflows.ts",
        "lib/temporal/workflows-*.ts",
        "lib/temporal/workflows/*.ts",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          ...builtinModules
            .filter((m) => !ALLOWED_NODE_BUILTINS.has(m))
            .flatMap((m) => [m, `node:${m}`]),
        ],
      },
    },
  ],
  ignorePatterns: [".eslintrc.cjs", "tests/*"],
};
