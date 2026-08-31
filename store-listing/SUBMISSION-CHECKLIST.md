# Chrome Web Store submission checklist

## Before upload

- [ ] Create or use the Chrome Web Store developer account and complete any identity/payment requirements shown by the dashboard.
- [ ] Host `PRIVACY-POLICY.md` at a stable public HTTPS URL.
- [ ] Confirm the support email `lax@comfy.org` is monitored.
- [ ] Run the automated tests and load the final ZIP in a clean Chrome profile.
- [ ] Verify that no API key, `.pem`, private signing key, or user-specific configuration is present in the ZIP.

## Package

- [ ] Upload `dist/lax-prompt-lens-v0.8.0-cws.zip`.
- [ ] Confirm the dashboard reads version `0.8.0`.
- [ ] Use `store-listing/assets/store-icon-128.png` for the store icon if requested separately.

## Store listing

- [ ] Paste English copy from `STORE-LISTING.md` as the default listing.
- [ ] Add Simplified Chinese localization and paste the Chinese copy.
- [ ] Upload the matching two screenshots from `assets/en` and `assets/zh-CN` for each locale.
- [ ] Upload `assets/small-promo-440x280.png`.
- [ ] Optionally upload `assets/marquee-1400x560.png`.
- [ ] Select the Productivity category.

## Privacy

- [ ] Paste the single-purpose statement and every permission justification from `PRIVACY-QUESTIONNAIRE.md`.
- [ ] Declare authentication information and website content as handled data.
- [ ] Declare no remote code.
- [ ] Confirm the Limited Use certification.
- [ ] Enter the public privacy-policy URL.

## Test instructions and distribution

- [ ] Paste `REVIEWER-NOTES.md` into the reviewer test-instructions field.
- [ ] Choose Public, Unlisted, or Private distribution deliberately; all are subject to review.
- [ ] Select the target regions.
- [ ] Preview the listing and verify that all claims match the current extension behavior.
- [ ] Submit for review.

## Known review-sensitive item

The optional `https://*/*` declaration exists solely to support arbitrary custom HTTPS API origins. The extension requests only the exact user-entered origin at runtime. If review rejects this optional capability, publish a store build limited to the OpenAI, xAI Grok, and JarlessAPI presets, or replace it with a narrower documented allowlist before resubmitting.
