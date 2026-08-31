# Chrome Web Store submission kit

This directory contains the ready-to-use materials for publishing LAX Prompt Lens.

## Upload files

- `assets/store-icon-128.png` — mandatory 128 × 128 store icon
- `assets/small-promo-440x280.png` — mandatory small promotional tile
- `assets/marquee-1400x560.png` — optional marquee promotional tile
- `assets/en/*.png` — English 1280 × 800 screenshots
- `assets/zh-CN/*.png` — Simplified Chinese 1280 × 800 screenshots
- `STORE-LISTING.md` — copy for the English and Simplified Chinese listings
- `PRIVACY-POLICY.md` — publish this policy at a public URL and paste that URL into the dashboard
- `PRIVACY-QUESTIONNAIRE.md` — answers and permission justifications for the Privacy tab
- `REVIEWER-NOTES.md` — test instructions for Chrome Web Store reviewers
- `SUBMISSION-CHECKLIST.md` — final dashboard checklist

The generated background source is in `source/promo-backdrop.png`. Store assets can be rebuilt with `tools/build-store-assets.cjs` when Sharp is available.
