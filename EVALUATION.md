# 技术评估

## 结论

首版采用 Chrome Manifest V3 侧边栏扩展，比纯 HTML 单页更适合这个任务。

## 方案比较

| 维度 | 纯 HTML | Chrome 扩展 |
| --- | --- | --- |
| 读取 Danbooru API | 容易被浏览器 CORS 阻止，需要代理服务 | 通过明确的 host permissions 直接读取 |
| 访问登录态可见内容 | 普通跨站请求不稳定 | 扩展请求可携带当前站点会话 |
| 调用视觉 API | 可以，但 Key 暴露在前端 | 同样是前端 Key，但可保存在扩展本地存储 |
| 安装成本 | 打开网页即可 | 需要加载扩展 |
| 长期使用体验 | 页面易丢失、需要独立托管 | 侧边栏常驻，适合边浏览边处理 |
| 无后端运行 | 受 CORS 限制 | 可行 |

纯 HTML 若要稳定上线，实际还需要一个后端代理，同时承担 Danbooru 抓取、图片转发、API Key 管理和限流。对于当前的个人工具阶段，这会增加部署和维护成本。

## 数据源选择

Danbooru 提供 `GET /posts/:id.json`。返回值中已经包含分类标签字段：

- `tag_string_artist`
- `tag_string_copyright`
- `tag_string_character`
- `tag_string_general`
- `tag_string_meta`
- `file_url` / `large_file_url` / `preview_file_url`

因此扩展没有依赖网页左栏的 CSS 类名和 DOM 层级。用户看到的仍是左侧标签表对应的数据，但实现对站点改版更耐受。

## Prompt 策略

Tags Prompt 做确定性转换：按分类顺序拼接、下划线转空格、括号转义、去重，默认排除 meta tags。

Visual NL Prompt 使用视觉模型观察图像，只输出一段可用于图像生成的自然语言描述，要求覆盖：

- 构图、镜头、透视、视觉焦点和空间层次；
- 姿态、重心、动作、手势和人物与道具的关系；
- 线条特征、边缘控制、上色与渲染方法；
- 光向、明度结构、配色、材质、氛围与视觉节奏。

Combined Prompt 默认按 `Tags → NL` 拼接，也允许切换为 `NL → Tags`。

## JarlessAPI 兼容

JarlessAPI 作为内置默认预设，使用 `https://jarlessapi.com` Base URL、Responses wire API、`gpt-5.6-luna` 和 `reasoning.effort = xhigh`。扩展把该 Base URL 解析为模型市场公开的标准端点 `https://jarlessapi.com/v1/responses`，使用 Bearer Key 鉴权，并默认发送 `store: false`。

请求体刻意不强制加入 `max_output_tokens`，以贴近 Codex 原生自定义 Responses provider 的请求行为，并减少兼容网关拒绝非必要参数的概率。

## 安全与产品化建议

当前版本适合个人本地使用。若要多人分发或商业化，建议增加后端：

1. API Key 改由服务端保管，前端使用短期会话令牌；
2. 增加用户鉴权、额度限制、失败重试和调用审计；
3. 对图片做尺寸压缩、格式转换与内容类型校验；
4. 缓存以 post ID + 模型 + Prompt 版本为键的分析结果；
5. 增加批量 URL、历史记录、模板版本和导出格式。
