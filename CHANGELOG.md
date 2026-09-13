# Changelog

## 2026-09-13

- Added task routing and the reusable contract for startup questionnaire data.
- Bundled `assets/lib/screen-scale.js` as the reusable v1.4 scale runtime.
- Added `codegen.config.schema.json` and zero-dependency `validate-config.mjs` for contract v1.
- Added `scaffold-vue2.mjs` for non-destructive Vue2 SFC project scaffolding.
- Added `verify-ui.mjs` Playwright probes for scale, scroll, sticky table headers, and console errors.
- Standardized `data-qa` selectors for scale and table probes, with legacy selector fallbacks and explicit CLI overrides.
- Changed `table-head` to point at the first sticky `<th>` instead of `<thead>`; sticky headers remain stable while `tbody` scrolls.
- Converted Vue2 scaffolding to reusable templates under `assets/templates/vue2/`.
- Added `test-skill.mjs` for config, syntax, scaffold, selector, local browser smoke, and interaction-probe checks.
- Added opt-in `verify-ui.mjs` probes for tab switching, search filtering/restoring, and non-blank chart canvas rendering.
