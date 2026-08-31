# Reviewer test instructions

## Overview

LAX Prompt Lens accepts a Danbooru post URL, extracts its public prompt tags, and can optionally send the post image to a user-selected vision API to produce an English art-direction prompt.

## Test without credentials

1. Install the unpacked extension or uploaded package.
2. Click the toolbar icon to open the full side panel.
3. Paste `https://shima.donmai.us/posts/11647422`.
4. Click **只提取标签 / Tags only**.
5. Confirm that the Tags Prompt appears. This path requires no account or API key.
6. Click **小窗模式 / Compact mode**, then click the toolbar icon to confirm the popup interface.

## Test visual analysis

Visual analysis requires the reviewer’s own compatible vision API credential because the extension does not operate a proxy or shared developer account.

1. Return to full mode.
2. Open **视觉 API 设置 / Vision API settings**.
3. Select OpenAI, xAI Grok, JarlessAPI, or Custom; enter a compatible image-capable model and API key.
4. Leave **Save key** disabled to keep the credential session-only.
5. Paste a public Danbooru post URL and click **提取并分析 / Extract & Analyze**.
6. Confirm that the Tags Prompt, Visual NL Prompt, and Combined Prompt appear and can be copied.

## Temporary-tab fallback

The extension normally requests public post JSON directly without credentials or cross-site cookies. Only when both direct host requests fail, it opens an inactive temporary Danbooru tab, runs the packaged same-origin JSON fetch, and closes the tab automatically. This behavior explains the `tabs` and `scripting` permissions.

## Remote code and monetization

- No remote code is executed.
- No analytics, advertisements, payments, subscriptions, or in-app purchases are present.
- No API key is included in the package.

Support contact: lax@comfy.org
