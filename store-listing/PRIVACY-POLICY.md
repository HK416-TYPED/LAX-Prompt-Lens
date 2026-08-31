# LAX Prompt Lens Privacy Policy

Effective date: August 27, 2026

Contact: lax@comfy.org

LAX Prompt Lens is a local-first Chrome extension. The developer does not operate a server for the extension and does not receive your prompts, images, API keys, settings, or browsing activity.

## Data the extension processes

The extension processes only the data required for its single purpose: extracting prompt tags from a Danbooru post and, when requested, generating an art-direction prompt from the post image.

- **Post URL and public post data.** The Danbooru URL you paste is used to request public post JSON, tags, metadata, and image files from `*.donmai.us` and `cdn.donmai.us`.
- **Reference image and analysis instruction.** When you click “Extract & Analyze” or generate from compact mode, the chosen post image and the built-in art-direction instruction are sent to the vision API provider you selected.
- **API credentials.** Your API key is sent in the authorization header only to the endpoint you configured. It is session-only by default. If you explicitly enable “Save key,” it is stored in Chrome extension local storage on your device.
- **Settings and generated results.** Provider settings, output preferences, UI mode, and the optional saved key are stored locally through Chrome extension storage. Compact mode temporarily keeps the latest URL, generated prompt, and result counts in Chrome session storage so they remain available during the browser session.
- **Diagnostics.** If a request fails, the extension creates a diagnostic report in the interface containing the extension version, timestamp, browser user agent, submitted post URL, request hosts, HTTP status codes, and error messages. The report is not transmitted to the developer. It leaves your device only if you choose to copy and share it.

## How data is used

Data is used only to retrieve the requested public post, generate the requested prompt, display results, remember your chosen settings, and diagnose failures. It is not used for advertising, profiling, credit decisions, analytics, or any purpose unrelated to the extension’s user-facing functionality.

## Data sharing and third parties

The developer does not sell, rent, or share user data. Network transfers occur only as necessary to perform actions requested by you:

- Danbooru/Donmai receives the post and image requests needed to retrieve public content. Direct extension requests omit cross-site credentials and use a no-referrer policy.
- Your selected vision API provider receives the reference image, analysis instruction, model settings, and API credential needed to generate the natural-language prompt. Supported presets include OpenAI, xAI Grok, and JarlessAPI; a custom OpenAI-compatible endpoint may be authorized by you at runtime.
- Chrome stores local and session data under the extension’s storage area on your device and may synchronize nothing from this extension; the extension uses `chrome.storage.local` and `chrome.storage.session`, not `chrome.storage.sync`.

Third-party services process data under their own terms and privacy policies. Review the policy of the provider you select before using visual analysis. The extension asks compatible Responses APIs not to retain responses when “Disable response storage” is enabled, but the provider’s actual retention practices remain governed by that provider.

## Retention and deletion

The developer retains no user data. Session-only API keys and compact-mode results expire with Chrome’s extension session storage. Locally saved settings and an optional saved key remain until you change them, clear the extension’s site data, or uninstall the extension. You can remove a saved key at any time by disabling “Save key” in the full panel and changing the field, or by clearing the extension’s storage in Chrome.

## Security

Remote API endpoints must use HTTPS. Plain HTTP is accepted only for `localhost` or `127.0.0.1`, allowing a user-controlled service on the same device. The extension does not execute remotely hosted code. No transmission method or local storage mechanism can be guaranteed completely secure, so use only providers you trust and avoid saving a key on a shared device.

## Chrome Web Store Limited Use

The extension’s use and transfer of information complies with the Chrome Web Store User Data Policy, including the Limited Use requirements. Data access is limited to what is necessary to provide the extension’s prominent, user-facing single purpose.

## Changes

Material changes to this policy will be published with a new effective date. If a change affects how data is collected, used, or shared, the extension listing and in-product disclosure will be updated before the change takes effect.

## Contact

Questions about this policy can be sent to lax@comfy.org.

---

# LAX Prompt Lens 隐私政策

生效日期：2026 年 8 月 27 日

联系邮箱：lax@comfy.org

LAX Prompt Lens 是一个本地优先的 Chrome 扩展。开发者没有为插件运营中转服务器，也不会收到你的提示词、图片、API Key、设置或浏览活动。

## 插件处理的数据

插件只处理完成其单一用途所必需的数据：从 Danbooru 帖子提取提示词标签，并在使用者主动要求时，根据帖子主图生成美术指导提示词。

- **帖子链接与公开帖子数据。** 你粘贴的 Danbooru 链接用于从 `*.donmai.us` 和 `cdn.donmai.us` 请求公开的帖子 JSON、标签、元数据及图片文件。
- **参考图与分析指令。** 当你点击“提取并分析”或在小窗中生成时，所选帖子主图和内置美术指导指令会发送到你选择的视觉 API 服务。
- **API 凭证。** API Key 只会通过授权请求头发送到你配置的接口。默认仅保留在当前会话；只有主动启用“保存 Key”后，才会写入设备上的 Chrome 扩展本地存储。
- **设置与生成结果。** 服务设置、输出偏好、界面模式和可选的已保存 Key 通过 Chrome 扩展存储保存在本机。小窗模式会在 Chrome 会话存储中暂时保留最近一次链接、生成结果及结果计数。
- **诊断信息。** 请求失败时，插件会在界面中生成包含版本、时间、浏览器 User Agent、所提交帖子链接、请求主机、HTTP 状态和错误信息的诊断报告。报告不会自动发给开发者，只有你主动复制并分享时才会离开设备。

## 数据用途

数据只用于读取你要求的公开帖子、生成提示词、显示结果、记忆设置和诊断故障。插件不会把数据用于广告、画像、信用判断、统计分析或任何与用户可见功能无关的目的。

## 数据传输与第三方

开发者不会出售、出租或分享用户数据。网络传输仅在执行你主动请求的功能时发生：Danbooru/Donmai 接收读取公开帖子与图片所需的请求；你选择的视觉 API 服务接收生成自然语言提示词所需的参考图、分析指令、模型设置与 API 凭证；Chrome 在本机扩展存储中保存设置和会话结果。插件使用 `chrome.storage.local` 与 `chrome.storage.session`，不使用 `chrome.storage.sync`。

第三方服务按照其自身条款与隐私政策处理数据。使用视觉分析前，请阅读你所选择服务商的政策。启用“禁用响应存储”时，插件会在兼容 Responses API 的请求中要求不保留响应，但服务商的实际保留方式仍以其政策为准。

## 保留与删除

开发者不保留任何用户数据。会话型 API Key 与小窗结果随 Chrome 扩展会话存储失效。本地设置和可选保存的 Key 会一直保留，直到你修改设置、清除扩展数据或卸载插件。你可以在完整版关闭“保存 Key”，或在 Chrome 中清除该扩展的存储。

## 安全

远程 API 必须使用 HTTPS。仅 `localhost` 与 `127.0.0.1` 可以使用 HTTP，以支持使用者自己设备上的服务。插件不执行远程托管代码。任何传输与本地存储方式都无法保证绝对安全，请只使用可信服务，也不要在共享设备上保存 Key。

## Chrome Web Store 有限使用

插件对信息的使用和传输遵守 Chrome Web Store 用户数据政策及 Limited Use 要求。数据访问仅限于完成插件明确、用户可见的单一用途所必需的范围。

## 政策变更与联系

政策发生实质变化时将更新生效日期，并在变化生效前同步更新商店页面和插件内披露。相关问题可发送至 lax@comfy.org。
