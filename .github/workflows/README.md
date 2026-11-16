# .github/workflows

**What's here:** CI and deploy workflows. Details in [`../README.md`](../README.md).

Runners are pinned to `ubuntu-24.04`, not `ubuntu-latest`: when `ubuntu-latest` moved to 26.04,
Playwright 1.56 could no longer install Chromium and the E2E job broke. Move the pin only together
with a Playwright upgrade that supports the new image.

**Network (ADR 0051):** both deploy workflows take `network` = `fuji` or `mainnet` and run in the GitHub environment of that name. A mainnet contract deploy also needs the `confirm_mainnet` input typed as `yes`; give the `mainnet` environment required reviewers so it also needs the owner's approval.
