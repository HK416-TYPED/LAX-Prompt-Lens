# Chrome Web Store Privacy tab

Use the following answers in the dashboard. Re-check the dashboard wording at submission time.

## Single purpose

Extract prompt-ready tags from a user-supplied Danbooru post URL and, when the user requests it, send the post image to the user-selected vision API to generate a professional illustration art-direction prompt.

## Permission justifications

### `storage`

Stores the user’s provider configuration, model and output preferences, selected interface mode, and—only when the user explicitly enables “Save key”—the API key in local extension storage. Session storage keeps an unsaved key and the latest compact-mode result for the current browser session.

### `sidePanel`

Provides the extension’s full interface beside the current page, including URL input, provider settings, preview, diagnostics, and prompt results.

### `tabs`

Creates one inactive temporary Danbooru tab only when both normal cross-origin JSON requests fail, waits for it to load, and closes it immediately after retrieving the requested post JSON. It is also needed to address the current browser window when switching interface modes.

### `scripting`

Runs a small packaged function in the temporary Danbooru tab to fetch the single requested post JSON from the page’s same-origin context. It is used only as a fallback after direct requests fail. No remotely hosted script is downloaded or executed.

### Host access: `https://*.donmai.us/*`

Reads public JSON, tags, metadata, and image URLs for the Danbooru post that the user explicitly pasted. Requests omit cross-site cookies whenever the direct extension fetch path is used.

### Host access: `https://cdn.donmai.us/*`

Downloads the requested post’s sample or original image so it can be previewed and, only after the user requests analysis, sent to the chosen vision API.

### Host access: `https://api.openai.com/*`

Allows the optional OpenAI preset to submit the user-requested vision analysis call directly from the extension.

### Host access: `https://api.x.ai/*`

Allows the optional official xAI Grok preset to submit the user-requested image-understanding call directly from the extension. The reference image is normalized to JPEG or PNG when necessary because those are the image formats supported by the xAI API.

### Host access: `https://jarlessapi.com/*`

Allows the optional JarlessAPI preset to submit the user-requested OpenAI-compatible vision analysis call directly from the extension.

### Optional host access: `https://*/*`

Supports a custom HTTPS OpenAI-compatible endpoint. Access is requested just in time for the exact origin entered by the user; the extension does not receive access unless the user approves Chrome’s permission prompt.

### Optional host access: `http://localhost/*` and `http://127.0.0.1/*`

Supports a user-controlled OpenAI-compatible service running locally on the same device. Non-loopback remote HTTP endpoints are rejected.

## Remote code

**No.** All JavaScript executed by the extension is packaged in the uploaded ZIP. Network calls retrieve JSON/images or submit API requests; responses are treated as data and are never executed as code.

## User-data declarations

- Authentication information: **Yes** — an API key supplied by the user is processed locally and sent only to the configured provider.
- Website content: **Yes** — the public Danbooru post URL, tags, metadata, and image are processed to produce the requested prompt.
- Web history / browsing activity: **No** — the extension does not monitor visited pages or browser history; it processes only a URL the user deliberately enters.
- Personal communications: **No**.
- Location, financial, health, or biometric information: **No**.

## Data-use certifications

- Data is used only for the extension’s single purpose: **Yes**.
- Data is sold to third parties: **No**.
- Data is used or transferred for personalized advertising: **No**.
- Data is used or transferred for creditworthiness or lending: **No**.
- Data is used for unrelated analytics or profiling: **No**.
- Humans read user data: **No**, except if a user voluntarily includes diagnostic information in a support request.
- Complies with Chrome Web Store Limited Use requirements: **Yes**.

## Privacy policy URL

Publish `PRIVACY-POLICY.md` as a stable public webpage. Recommended URL after enabling GitHub Pages:

`https://hk416-typed.github.io/LAX-Prompt-Lens/privacy/`
