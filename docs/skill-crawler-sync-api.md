# Skill 爬虫同步接口文档

本文档约定爬虫服务器向 Dify 提供的 Skill 库增量同步接口。Dify 通过 Celery Beat 按日期窗口拉取数据，先保存原始 JSON 快照，再做过滤、去重、关键词分组、Pydantic 校验与入库。

首版同步范围为 Skill 元数据、安装次数、GitHub Stars、内容来源、安装命令和 SKILL.md Markdown 原文；不处理 ZIP/icon 下载。分类和标签不再由接口传递，Dify 会根据名称、描述和 `skill_markdown` 原文匹配最合适的本地关键词。

## 认证

Dify 请求爬虫服务器时使用 Bearer Token：

```http
Authorization: Bearer <SKILL_CRAWLER_API_TOKEN>
Accept: application/json
```

爬虫服务器应在令牌缺失或无效时返回 `401 Unauthorized`。

## 增量列表接口

```http
GET /api/v1/skills/getlist?from_date=2026-06-24&to_date=2026-06-25&page=1&limit=100
```

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `from_date` | `YYYY-MM-DD` | 是 | 增量窗口开始日期，包含当天。 |
| `to_date` | `YYYY-MM-DD` | 是 | 增量窗口结束日期，包含当天。 |
| `page` | integer | 是 | 从 `1` 开始的页码。 |
| `limit` | integer | 是 | 每页条数，建议 `100`，最大不超过 `500`。 |

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
      "skill_markdown": "---\nname: pdf-toolkit\n---\n# PDF Toolkit\nExtract PDF text and tables.",
      "status": "published",
      "updated_at": "2026-06-25T10:00:00Z"
    }
  ],
  "page": 1,
  "limit": 100,
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
| `source_type` | string | 是 | 内容来源，仅允许 `github`、`official`、`site`、`other`，分别展示为 GitHub、官网、本站、其他来源。 |
| `source_url` | string/null | 否 | 内容来源地址。GitHub 来源直接把 GitHub 仓库地址放在该字段。 |
| `install_command` | string/null | 否 | 安装命令。 |
| `install_count` | integer | 否 | 安装次数。下载次数与安装次数视为同一指标，不再单独传 `download_count`。 |
| `github_stars` | integer | 否 | GitHub Star 数。非 GitHub 来源可传 `0`。 |
| `skill_markdown` | string/null | 条件必填 | Skill 原文。`published`、`unlisted` 状态必须提供非空内容。 |
| `status` | string | 是 | 仅允许 `published`、`unlisted`、`archived`、`deleted`。 |
| `updated_at` | ISO 8601 datetime | 是 | 爬虫服务器侧更新时间，用于同一窗口内重复 `slug` 的去重。 |

不再传递的字段：

| 字段 | 处理 |
| --- | --- |
| `repository_url` | 已移除，GitHub 地址由 `source_url` 承载。 |
| `categories` / `tags` | 已移除，Dify 根据原文关键词自动匹配。 |
| `download_count` | 已移除，统一使用 `install_count`。 |
| `readme_markdown` | 已移除，统一使用 `skill_markdown`。 |
| `version` | 已移除，Dify 根据 Markdown 内容变化创建新的 latest version。 |

状态映射：

| 爬虫状态 | Dify 入库状态 |
| --- | --- |
| `published` | `published` |
| `unlisted` | `unlisted` |
| `archived` | `archived` |
| `deleted` | `archived` |

## 分页与幂等

- `has_more=true` 时必须返回 `next_page`，Dify 会继续拉取下一页。
- 同一日期窗口重复调用必须返回语义一致的数据。
- 同一响应窗口内如果出现重复 `slug`，Dify 保留 `updated_at` 最新的一条。
- Dify 会保存每次响应的原始 JSON 快照，但查询展示只使用数据库数据。
- 同一个 `slug` 的基础字段、安装次数、GitHub Stars 或 Markdown 内容变化时，重复同步应得到相同最终状态。

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
