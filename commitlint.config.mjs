export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      1,
      "always",
      ["web", "contracts", "sdk", "rules", "workers", "docs", "design", "ci", "deps", "repo"],
    ],
  },
};
