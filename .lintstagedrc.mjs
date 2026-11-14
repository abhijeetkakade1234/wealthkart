export default {
  "*.{ts,tsx,js,mjs,cjs,json,css,md,yml,yaml}": ["prettier --write"],
  "packages/contracts/**/*.sol": () => ["pnpm --filter @wealthkart/contracts run fmt:check"],
};
