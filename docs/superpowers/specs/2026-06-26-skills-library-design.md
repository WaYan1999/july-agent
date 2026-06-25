# Skills 技能库首期设计

日期：2026-06-26

## 背景

探索广场当前以应用库为主，缺少面向 Agent Skills 的目录能力。首期目标是在探索广场应用库下面新增 Skills 技能库，让用户可以发现技能、查看详情、复制安装命令或下载技能资源；同时后台管理要能维护技能条目、上传 ZIP 包或单个 Markdown 文件，并控制发布状态。

设计参考 `skills.sh` 的内容组织方式：列表负责发现，详情负责安装命令、README/SKILL.md 预览、来源、审计信息和下载动作。页面视觉参考现有插件市场，不复用插件安装逻辑。

## 首期范围

### 包含

- 探索广场新增 Skills 技能库入口和 `/explore/skills` 页面。
- 技能列表支持搜索、分类筛选、标签展示、排序和分页或增量加载。
- 技能卡片展示名称、描述、作者、来源类型、资源类型、标签、安装量或下载量、审计状态。
- 点击卡片打开详情抽屉。
- 详情抽屉展示安装命令、复制安装命令、README/SKILL.md 预览、来源信息、审计信息、版本信息、下载按钮。
- 兼容三种首期资源形态：
  - GitHub 或外部来源型：主要动作是复制安装命令，展示仓库和来源链接。
  - ZIP 技能包型：支持上传、展示、下载 ZIP，抽屉主按钮为下载 ZIP，同时支持复制安装命令。
  - 单 Markdown 型：支持上传单个 `.md` 文件，抽屉直接展示 Markdown 内容，支持下载 MD 和复制内容。
- 后台管理新增 Skills 资源，支持新增、编辑、删除、上传资源、维护分类标签、维护发布状态。
- 只有后台发布状态为已发布的技能才展示在前台。
- 后端新增独立 Skills 数据模型和 Console/Admin API。

### 不包含

- 不做真实一键安装到用户机器或工作区。
- 不接入插件市场安装、升级、卸载流程。
- 不做用户评分、评论、收藏、付费市场。
- 不做复杂自动同步任务和完整审核流转，只记录审计状态与审计说明。
- 不执行技能内容，不做运行时权限授权。

## 用户角色

- 普通用户：在探索广场浏览 Skills，搜索筛选，打开详情，复制安装命令或下载 ZIP/MD 资源。
- 后台管理员：在 `/admin` 中维护 Skills 条目，上传资源，编辑元数据，控制发布状态和审计状态。

## 前台体验设计

### 入口

在探索广场应用库下面新增 Skills 技能库入口。推荐路径为 `/explore/skills`，与现有 `/explore/apps` 同属 Explore 区域。

导航文案：

- 中文：Skills 技能库
- 英文：Skills

### 列表区域

列表页面使用插件市场式卡片网格，不做营销型落地页。顶部为页面标题、分类分段控件、搜索输入、排序控件。

搜索范围：

- 技能名称
- slug
- 描述
- 作者
- 标签
- 分类

筛选范围：

- 分类：如官方、前端、后端、文档、测试、代码审查、设计、自动化。
- 标签：展示在卡片和详情内，首期可以点击标签触发搜索或过滤。
- 资源类型：全部、GitHub/外部、ZIP、Markdown。
- 审计状态：全部、已审计、手动审计、待审计、未通过。

排序：

- 默认按 `position asc, published_at desc, created_at desc`。
- 可选最新发布、最多下载或安装、名称。

空状态：

- 无搜索结果时提示调整关键词或筛选条件。
- 无已发布技能时展示空状态，不泄露草稿或归档条目。

### 卡片字段

卡片展示：

- icon 或首字母占位。
- 名称。
- 简短描述，两行截断。
- 作者或来源组织。
- 来源类型：GitHub、上传、Markdown、外部。
- 资源类型：ZIP、MD、Remote。
- 分类角标。
- 标签，最多展示 3 个，超出显示数量。
- 下载量或安装量。
- 审计状态徽标。

### 详情抽屉

详情抽屉宽度和交互参考现有插件详情抽屉，右侧滑出，支持关闭、滚动、复制反馈。

详情头部：

- icon、名称、版本、作者。
- 资源类型徽标。
- 审计状态徽标。
- 主操作按钮。

主操作根据资源类型变化：

- `remote_reference`：复制安装命令。
- `zip_package`：下载 ZIP，旁边提供复制安装命令。
- `markdown_file`：下载 MD 或复制 Markdown 内容，旁边提供复制安装命令。

详情内容：

- 安装命令代码块，带复制按钮。
- README/SKILL.md Markdown 预览，长内容限制高度并滚动。
- 来源信息：source_type、source_url、repository_url。
- 审计信息：audit_status、audit_notes、checksum_sha256、published_at。
- 版本信息：version、package_filename、package_size。
- 标签和分类。

错误处理：

- 复制失败时显示错误提示。
- 下载资源不存在或签名失效时提示重试。
- README 为空时展示“暂无 README 预览”。

## 后台管理设计

### 入口

在现有 `/admin` 资源导航中新增 `Skills`。

后台登录仍沿用当前 `ADMIN_API_KEY` 鉴权，不依赖 console 登录态。

### 列表

后台 Skills 列表展示：

- 名称和 slug。
- 分类和标签。
- 资源类型。
- 发布状态。
- 审计状态。
- 最新版本。
- 排序值。
- 更新时间。
- 操作：编辑、删除、发布、下架。

后台搜索范围：

- 名称
- slug
- 描述
- 作者
- 标签

后台筛选：

- 发布状态：草稿、已发布、已下架、已归档。
- 资源类型：ZIP、Markdown、外部。
- 审计状态。

### 新增和编辑表单

基础信息：

- 名称，必填。
- slug，必填且唯一，只允许小写字母、数字、短横线、下划线和冒号。
- 简短描述，必填。
- 作者名称。
- 图标配置或图标文件。
- 分类，多选。
- 标签，多选或逗号输入。
- 排序值。

来源与安装：

- 来源类型：GitHub、上传、Markdown、外部。
- 来源 URL。
- 仓库 URL。
- 安装命令。
- 兼容平台，首期可用字符串数组。

资源与版本：

- 版本号，默认 `1.0.0`。
- 内容类型：ZIP 技能包、单 Markdown、远程引用。
- 上传 ZIP 或 MD 文件。
- README Markdown，可自动提取后手动编辑。
- SKILL Markdown，可自动提取后手动编辑。

发布与审计：

- 发布状态，必填。
- 审计状态，必填。
- 审计说明。
- 校验摘要只读展示。

### 发布状态规则

发布状态字段使用 `publication_status`，枚举如下：

- `draft`：草稿，只在后台可见。
- `published`：已发布，允许在前台展示。
- `unlisted`：已下架，不在前台展示，但后台保留。
- `archived`：已归档，不在前台展示，通常不再编辑或下载。

前台 Console API 必须默认过滤：

```text
publication_status = 'published'
```

后台 Admin API 可以查询全部状态。删除操作首期建议软删除为 `archived`，避免破坏历史资源和审计信息。

### 上传规则

ZIP 技能包：

- 允许扩展名 `.zip`。
- 上传后保存到 `UploadFile`，同时写入 `skill_assets`。
- 计算 SHA256。
- 尝试从 ZIP 中提取 `README.md`、`readme.md`、`SKILL.md` 或顶层 Markdown 文件作为预览内容。
- 不执行 ZIP 内文件，只做读取和展示。
- 下载通过受控接口或签名 URL。

单 Markdown：

- 允许扩展名 `.md` 或 `.markdown`。
- 上传后保存到 `UploadFile`，同时读取文本写入 `skill_versions.skill_markdown` 或 `readme_markdown`。
- 详情抽屉直接展示 Markdown 预览。
- 支持下载原始 MD。

远程引用：

- 不要求上传文件。
- 必须填写来源 URL 或仓库 URL。
- 安装命令必填。
- README 可以手动填写或后续由同步任务补齐，首期不做自动同步。

## 数据库设计

采用“目录 + 版本/资产 + 分类标签”模型。

### skills

存储技能稳定目录信息。

字段：

- `id`: UUID，主键。
- `slug`: 字符串，唯一索引。
- `name`: 字符串。
- `description`: 文本。
- `author_name`: 字符串，可空。
- `source_type`: 枚举，`github`、`upload`、`markdown`、`external`。
- `source_url`: 字符串，可空。
- `repository_url`: 字符串，可空。
- `install_command`: 文本，可空；远程引用型必填。
- `icon`: 字符串，可空。
- `icon_background`: 字符串，可空。
- `icon_url`: 字符串，可空。
- `publication_status`: 枚举，`draft`、`published`、`unlisted`、`archived`。
- `audit_status`: 枚举，`pending`、`passed`、`failed`、`manual`。
- `audit_notes`: 文本，可空。
- `download_count`: 整数，默认 0。
- `install_count`: 整数，默认 0。
- `position`: 整数，默认 0。
- `published_at`: 时间，可空。
- `created_by`: 字符串，可空。
- `updated_by`: 字符串，可空。
- `created_at`: 时间。
- `updated_at`: 时间。

索引：

- `idx_skills_slug_unique` 唯一。
- `idx_skills_publication_status_position`。
- `idx_skills_source_type`。
- `idx_skills_audit_status`。
- 名称和描述搜索按当前数据库能力使用 `ilike`，后续再考虑全文索引。

### skill_versions

存储技能版本和可预览内容。

字段：

- `id`: UUID，主键。
- `skill_id`: UUID，外键。
- `version`: 字符串。
- `content_type`: 枚举，`zip_package`、`markdown_file`、`remote_reference`。
- `readme_markdown`: 文本，可空。
- `skill_markdown`: 文本，可空。
- `package_filename`: 字符串，可空。
- `package_size`: 整数，可空。
- `checksum_sha256`: 字符串，可空。
- `is_latest`: 布尔，默认 false。
- `published_at`: 时间，可空。
- `created_at`: 时间。
- `updated_at`: 时间。

约束：

- 同一个 `skill_id` 下 `version` 唯一。
- 同一个 `skill_id` 只能有一个 `is_latest = true`，如果数据库不支持部分唯一索引，则在 service 层保证。

### skill_assets

统一承载 ZIP、Markdown、图标和 README 相关文件。

字段：

- `id`: UUID，主键。
- `skill_id`: UUID，外键。
- `version_id`: UUID，外键，可空。
- `asset_type`: 枚举，`package`、`markdown`、`icon`、`readme_asset`。
- `upload_file_id`: UUID，引用 `UploadFile.id`。
- `filename`: 字符串。
- `mime_type`: 字符串。
- `size`: 整数。
- `sha256`: 字符串。
- `created_at`: 时间。

### skill_categories

字段：

- `id`: UUID，主键。
- `slug`: 字符串，唯一。
- `name`: 字符串。
- `position`: 整数。
- `created_at`: 时间。
- `updated_at`: 时间。

### skill_tags

字段：

- `id`: UUID，主键。
- `slug`: 字符串，唯一。
- `name`: 字符串。
- `created_at`: 时间。
- `updated_at`: 时间。

### 绑定表

`skill_category_bindings`：

- `skill_id`
- `category_id`

`skill_tag_bindings`：

- `skill_id`
- `tag_id`

两个绑定表均使用组合唯一约束。

## 后端 API 设计

### Console API

`GET /console/api/explore/skills`

查询参数：

- `keyword`
- `category`
- `tag`
- `source_type`
- `content_type`
- `audit_status`
- `sort`
- `page`
- `limit`

行为：

- 只返回 `publication_status = 'published'` 的 Skills。
- 默认只关联 latest version。
- 返回分类和标签汇总，供前端筛选。

`GET /console/api/explore/skills/{slug}`

行为：

- 只允许访问 `publication_status = 'published'` 的 Skill。
- 返回详情抽屉所需全部字段。
- 未发布或不存在时返回 404。

`GET /console/api/explore/skills/{id}/download`

行为：

- 只允许下载已发布 Skill 的 latest version 资源。
- ZIP 返回 ZIP，Markdown 返回 MD。
- 远程引用型没有本地文件时返回 404 或禁用下载入口。
- 成功下载后增加 `download_count`。

`POST /console/api/explore/skills/{id}/copy-events`

可选。首期如果需要安装量统计，可以在用户复制安装命令后调用，增加 `install_count` 或记录轻量事件。若不需要精确统计，可暂不实现。

### Admin API

`GET /admin/api/skills`

后台列表，允许查询全部发布状态。

`POST /admin/api/skills`

新增技能基础信息和首个版本。支持 JSON 表单；文件上传可拆到 assets 接口。

`GET /admin/api/skills/{id}`

后台详情，返回全部状态、版本和资产信息。

`PATCH /admin/api/skills/{id}`

编辑基础信息、发布状态、审计状态、分类标签和 latest version 文本内容。

`DELETE /admin/api/skills/{id}`

软删除，设置为 `archived`。

`POST /admin/api/skills/{id}/versions`

新增版本，并可设置为 latest。

`POST /admin/api/skills/{id}/assets`

上传 ZIP、MD 或图标资产，保存 `UploadFile` 和 `skill_assets`，并在需要时更新 latest version 的 README/SKILL Markdown 和校验摘要。

## 前端实现边界

### 新增模块

建议新增：

- `web/app/(commonLayout)/explore/skills/page.tsx`
- `web/app/components/explore/skill-list/*`
- `web/app/components/explore/skill-card/*`
- `web/app/components/explore/skill-detail-drawer/*`
- `web/models/skill.ts`
- `web/service/skills.ts`
- `web/service/use-skills.ts`
- `web/contract/console/skills.ts`

### 复用

- 复用 Explore 布局。
- 复用插件市场卡片密度和详情抽屉交互。
- 复用 `@langgenius/dify-ui` 的 Drawer、Button、Input、Dialog、Switch、Textarea 等组件。
- 复制交互使用现有 toast 或 copy helper。

### i18n

前端用户可见文案必须进入 i18n。至少更新：

- `web/i18n/*/explore.json`
- `web/i18n/*/admin.json`
- 必要时更新 i18n resource 注册。

不要在组件中硬编码用户可见文案。

## 后端实现边界

### 新增模块

建议新增：

- `api/controllers/console/explore/skills.py`
- `api/controllers/admin/skills.py`
- `api/services/skill_service.py`
- `api/services/admin_skill_service.py` 或并入现有 `AdminService` 的 Skills 分支。
- `api/models/model.py` 中新增模型，或按项目已有模型拆分方式放置。
- Alembic migration 新增表和索引。

控制器只负责参数校验和响应序列化；查询、上传解析、状态变更、下载计数放 service。

### 文件服务

复用 `FileService`、`UploadFile` 和 `storage`：

- 不直接写裸文件系统。
- 下载使用受控接口或签名 URL。
- ZIP 解析只读取必要文件，防止路径穿越和过大内容。
- `.md` 内容按 UTF-8 读取，失败时提示文件编码不支持。

## 安全与审计

- 后台上传只允许 `.zip`、`.md`、`.markdown`，图标另按图片白名单处理。
- 拒绝路径穿越文件名。
- 计算 SHA256 并展示在详情抽屉和后台。
- ZIP 不执行，只读取 README/SKILL.md 文本。
- 前台只暴露已发布资源。
- 审计状态不等于发布状态：可以发布一个 `manual` 审计的资源，但前台必须清楚展示状态。
- 归档资源不在前台展示，下载接口也不允许下载。

## 验收标准

### 前台

- 用户可以从探索广场进入 Skills 技能库。
- 用户可以搜索技能名称、描述和标签。
- 用户可以按分类过滤。
- 卡片展示资源类型、来源和审计状态。
- 点击卡片打开详情抽屉。
- 详情抽屉可以复制安装命令。
- ZIP 技能可以下载 ZIP。
- 单 MD 技能可以预览 Markdown 并下载 MD。
- 未发布、下架和归档技能不出现在列表，也不能通过详情 API 访问。

### 后台

- 管理员可以新增 Skill。
- 管理员可以编辑 Skill 基础信息、分类、标签、安装命令。
- 管理员可以上传 ZIP 技能包。
- 管理员可以上传单 MD 技能。
- 管理员可以设置发布状态。
- 管理员可以设置审计状态和审计说明。
- 管理员删除 Skill 后，该 Skill 不再前台展示。

### 数据与 API

- `publication_status = published` 是前台展示的唯一准入条件。
- latest version 能正确返回 README/SKILL.md 预览。
- ZIP/MD 资产有 SHA256、文件名、大小记录。
- 后台列表能查询草稿、已发布、已下架、已归档全部记录。

## 测试策略

后端单元测试：

- Console Skills 列表只返回已发布数据。
- Console Skills 详情拒绝未发布数据。
- Admin Skills 新增、编辑、软删除。
- 上传 ZIP 提取 README/SKILL.md。
- 上传单 MD 保存并返回预览。
- 下载接口拒绝未发布或归档资源。

前端测试：

- Skills 列表渲染、搜索参数变更、分类过滤。
- 卡片点击打开详情抽屉。
- 详情抽屉按 ZIP/MD/远程引用展示不同操作。
- 复制命令按钮调用剪贴板并显示反馈。
- Admin Skills 表单支持发布状态和上传入口。

质量命令：

- 后端：`uv run --project api pytest` 针对新增单元测试。
- 前端：`pnpm lint:fix`、`pnpm type-check`、相关 Vitest 测试。

## 后续演进

- 从 GitHub 自动同步 README/SKILL.md。
- 增加安装事件流水和用户收藏。
- 增加评分、评论和推荐排序。
- 增加自动审计任务和审核工作流。
- 支持多版本切换和历史版本下载。
- 支持技能合集或专题。
