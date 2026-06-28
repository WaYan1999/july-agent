# Skill 爬虫同步接口文档

本文档约定爬虫服务器向 Dify 提供的 Skill 库增量同步接口。Dify 通过后台自动服务按日期窗口拉取数据，先保存原始 JSON 快照，再做校验、分类匹配、标签同步与入库；完整处理成功后删除本地 JSON 快照，失败时保留快照方便排查。

同步范围包括 Skill 元数据、安装次数、GitHub Star 数、内容来源、内容类型、分类词列表、标签、安装命令和 `SKILL.md` Markdown 原文；暂不处理 ZIP/icon 下载。

## 认证

Dify 请求爬虫服务器时使用 Bearer Token：

```http
Authorization: Bearer <SKILL_CRAWLER_API_TOKEN>
Accept: application/json
```

爬虫服务器应在令牌缺失或无效时返回 `401 Unauthorized`。

## 增量列表接口

```http
GET /api/v1/skills/getlist?from_date=2026-06-24&to_date=2026-06-25&page=1&limit=50
```

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `from_date` | `YYYY-MM-DD` | 是 | 增量窗口开始日期，包含当天。 |
| `to_date` | `YYYY-MM-DD` | 是 | 增量窗口结束日期，包含当天。 |
| `page` | integer | 是 | 从 `1` 开始的页码。 |
| `limit` | integer | 是 | 每页条数，默认 `50`，最大不超过 `500`。 |
| `star` | integer | 否 | 可选 Star 筛选/透传参数；仅作为请求参数传给爬虫服务，响应字段仍为 `github_stars`。 |

响应示例：

```json
{
  "data": [
    {
      "slug": "pdf-toolkit",
      "name": "PDF Toolkit",
      "description": "Work with PDFs.",
      "author_name": "Dify",
      "source_type": "github",
      "source_url": "https://github.com/example/pdf-toolkit",
      "install_command": "codex skills install pdf-toolkit",
      "install_count": 128,
      "github_stars": 42,
      "content_type": "markdown_file",
      "categories": ["文档", "pdf"],
      "tags": ["pdf", "automation"],
      "skill_markdown": "---\nname: pdf-toolkit\n---\n# PDF Toolkit\nExtract PDF text and tables.",
      "status": "published",
      "updated_at": "2026-06-25T10:00:00Z"
    }
  ],
  "page": 1,
  "limit": 50,
  "has_more": false,
  "next_page": null,
  "sync_window": {
    "from_date": "2026-06-24",
    "to_date": "2026-06-25"
  }
}
```

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `slug` | string | 是 | 全局稳定唯一标识，仅允许小写字母、数字、`_`、`:`、`-`。同一个 `slug` 始终代表同一个 Skill。 |
| `name` | string | 是 | 展示名称，最长 255 字符。 |
| `description` | string | 是 | 简介，可为空字符串。 |
| `author_name` | string/null | 否 | 作者名称。 |
| `source_type` | string | 是 | 内容来源，仅允许 `github`、`official`、`site`、`other`。 |
| `source_url` | string/null | 否 | 内容来源地址。GitHub 来源直接把仓库地址放在该字段。 |
| `install_command` | string/null | 否 | 安装命令。 |
| `install_count` | integer | 否 | 安装次数。下载次数与安装次数视为同一指标，不再单独传 `download_count`。 |
| `github_stars` | integer | 否 | GitHub Star 数。接口响应返回该字段；同步入库写入本地 `skills.github_stars`。 |
| `content_type` | string | 否 | 内容类型，支持 `remote_reference`、`zip_package`、`markdown_file`，也兼容 `远程拉取`、`ZIP包`、`Markdown文档`；未传时默认 `markdown_file`。 |
| `categories` | string[] | 否 | 分类词列表，可传中文词、英文词、旧 slug 或关键词，如 `["前端", "react", "ui"]`。Dify 会用这些词匹配本地 `skill_categories` 分类库，只绑定一个最高分分类。 |
| `tags` | string[] | 否 | Skill 标签 slug 列表，仅允许小写字母、数字、`_`、`:`、`-`；空值会被忽略，同一 Skill 内会去重。 |
| `skill_markdown` | string/null | 条件必填 | Skill 原文。`content_type=markdown_file` 且状态非 `deleted` 时必须提供非空内容。 |
| `status` | string | 是 | 仅允许 `published`、`unlisted`、`archived`、`deleted`。 |
| `updated_at` | ISO 8601 datetime | 是 | 爬虫服务器侧更新时间。 |

## 分类、状态与幂等

- `categories` 只作为分类词列表，不会原样入库，也不会动态创建分类。
- 分类库以本地 `skill_categories` 为准；无匹配时回退到 `other`，若 `other` 不存在则不绑定分类并记录 warning。
- `tags` 会按规范化后的 slug 直接复用入库。
- `content_type` 会写入最新 Skill version；内容类型或 Markdown 内容变化时会创建新的 latest version。
- 新拉取创建的 Skill 默认入库为 `draft`，`published_at = null`。
- 更新已有 Skill 时不覆盖当前发布状态，避免爬虫同步影响人工发布状态。
- `deleted` 会把本地已存在的 Skill 归档；本地不存在则忽略。
- 同一响应窗口内如果出现重复 `slug`，Dify 保留 `updated_at` 最新的一条。
- 同一个 `slug` 的基础字段、安装次数、GitHub Stars、内容类型或 Markdown 内容变化时，重复同步应得到相同最终状态。

## 不再传递的字段

| 字段 | 处理 |
| --- | --- |
| `repository_url` | 已移除，GitHub 地址由 `source_url` 承载。 |
| `download_count` | 已移除，统一使用 `install_count`。 |
| `readme_markdown` | 已移除，统一使用 `skill_markdown`。 |
| `version` | 已移除，Dify 根据 Markdown 内容变化创建新的 latest version。 |

## 后台自动服务配置

后台自动服务可通过配置 JSON 覆盖 `from_date`、`to_date`、`limit`、`star`、`api_url`、`api_token`；未配置日期时默认同步当天，未配置 `limit` 时默认每页 50 条，未配置 `star` 时不向爬虫服务传该参数。

配置 JSON 也兼容请求示例结构：`headers.Authorization` 可写 `Bearer <token>`，`params.from_date`、`params.to_date`、`params.limit`、`params.star` 会作为查询参数。

## 错误码

| HTTP 状态 | 场景 |
| --- | --- |
| `400` | 日期格式、页码或 limit 不合法。 |
| `401` | Bearer Token 缺失或无效。 |
| `429` | 请求过于频繁。 |
| `500` | 爬虫服务器内部错误。 |

错误响应建议：

```json
{
  "code": "invalid_request",
  "message": "from_date must be YYYY-MM-DD"
}
```
