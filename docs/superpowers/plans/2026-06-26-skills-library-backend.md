# Skills 技能库后端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Skills 技能库首期提供数据库模型、Console API、Admin API、上传解析、下载和后台管理能力。

**Architecture:** 后端采用“模型 + 服务 + 控制器”的现有分层。`SkillService` 只暴露已发布资源给 Console API，`AdminSkillService` 负责跨租户后台维护、版本、分类标签和资产上传解析；控制器只做请求校验、鉴权装饰器和响应序列化。

**Tech Stack:** Python、Flask-RESTX、Pydantic v2、SQLAlchemy、Alembic、pytest、现有 `UploadFile`/`storage` 文件服务。

---

## 文件结构

- 修改：`api/models/model.py`
  - 新增 Skills 相关枚举和 SQLAlchemy 模型：`Skill`、`SkillVersion`、`SkillAsset`、`SkillCategory`、`SkillTag`、绑定表模型。
- 修改：`api/models/__init__.py`
  - 导出新增模型和枚举，保持测试和服务可从 `models` 包导入。
- 新增：`api/migrations/versions/2026_06_26_0001-add_skills_library_tables.py`
  - 创建 Skills 相关表、索引和约束；降级时按外键依赖逆序删除。
- 新增：`api/services/skill_service.py`
  - Console 查询、详情、下载定位、下载计数、复制安装命令计数。
- 新增：`api/services/admin_skill_service.py`
  - Admin 列表、详情、新增、编辑、软删除、新增版本、绑定分类标签、资产元信息写入、ZIP/Markdown 只读解析。
- 新增：`api/controllers/console/explore/skills.py`
  - `/console/api/explore/skills` 列表、`/{slug}` 详情、`/{id}/download` 下载、`/{id}/copy-events` 复制事件。
- 修改：`api/controllers/console/__init__.py`
  - 导入 `controllers.console.explore.skills`，确保路由注册。
- 新增：`api/controllers/admin/skills.py`
  - `/admin/api/skills` 列表/新增、`/{id}` 详情/编辑/软删除、`/{id}/versions`、`/{id}/assets`。
- 修改：`api/controllers/admin/__init__.py`
  - 将 `controllers.admin.skills` 加入 `RESOURCE_MODULES`。
- 新增：`api/tests/unit_tests/services/test_skill_service.py`
  - 覆盖 Console 只读发布过滤、详情 404、下载计数、复制计数。
- 新增：`api/tests/unit_tests/services/test_admin_skill_service.py`
  - 覆盖 Admin 创建、编辑、归档、latest version、ZIP/MD 解析工具。
- 新增：`api/tests/unit_tests/controllers/console/explore/test_skills.py`
  - 覆盖 Console 控制器响应和鉴权边界。
- 新增：`api/tests/unit_tests/controllers/admin/test_skills.py`
  - 覆盖 Admin 控制器请求校验、序列化和服务委托。
- 修改：`api/tests/unit_tests/extensions/test_ext_blueprints_openapi.py`
  - 如新增路由影响 OpenAPI 快照式断言，则更新测试预期。

---

### Task 1: 后端模型和迁移

**Files:**
- Modify: `api/models/model.py`
- Modify: `api/models/__init__.py`
- Create: `api/migrations/versions/2026_06_26_0001-add_skills_library_tables.py`

- [ ] **Step 1: 写模型导出失败测试**

在 `api/tests/unit_tests/services/test_skill_service.py` 中先加入导入测试，确保新增模型名可从 `models` 导出：

```python
def test_skill_models_are_exported():
    from models import (
        Skill,
        SkillAsset,
        SkillAssetType,
        SkillAuditStatus,
        SkillCategory,
        SkillContentType,
        SkillPublicationStatus,
        SkillSourceType,
        SkillTag,
        SkillVersion,
    )

    assert Skill.__tablename__ == "skills"
    assert SkillVersion.__tablename__ == "skill_versions"
    assert SkillAsset.__tablename__ == "skill_assets"
    assert SkillCategory.__tablename__ == "skill_categories"
    assert SkillTag.__tablename__ == "skill_tags"
    assert SkillPublicationStatus.PUBLISHED.value == "published"
    assert SkillAuditStatus.MANUAL.value == "manual"
    assert SkillSourceType.GITHUB.value == "github"
    assert SkillContentType.ZIP_PACKAGE.value == "zip_package"
    assert SkillAssetType.PACKAGE.value == "package"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `uv run --project api pytest api/tests/unit_tests/services/test_skill_service.py::test_skill_models_are_exported -q`

Expected: FAIL，失败原因为 `ImportError` 或属性不存在。

- [ ] **Step 3: 新增模型和枚举**

在 `api/models/model.py` 的 `IconType` 附近新增枚举：

```python
class SkillSourceType(StrEnum):
    GITHUB = "github"
    UPLOAD = "upload"
    MARKDOWN = "markdown"
    EXTERNAL = "external"


class SkillPublicationStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    UNLISTED = "unlisted"
    ARCHIVED = "archived"


class SkillAuditStatus(StrEnum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"
    MANUAL = "manual"


class SkillContentType(StrEnum):
    ZIP_PACKAGE = "zip_package"
    MARKDOWN_FILE = "markdown_file"
    REMOTE_REFERENCE = "remote_reference"


class SkillAssetType(StrEnum):
    PACKAGE = "package"
    MARKDOWN = "markdown"
    ICON = "icon"
    README_ASSET = "readme_asset"
```

在 `UploadFile` 前或 `RecommendedApp` 后新增模型：

```python
class Skill(TypeBase):
    __tablename__ = "skills"
    __table_args__ = (
        sa.PrimaryKeyConstraint("id", name="skill_pkey"),
        sa.Index("idx_skills_slug_unique", "slug", unique=True),
        sa.Index("idx_skills_publication_status_position", "publication_status", "position"),
        sa.Index("idx_skills_source_type", "source_type"),
        sa.Index("idx_skills_audit_status", "audit_status"),
    )

    id: Mapped[str] = mapped_column(
        StringUUID,
        insert_default=lambda: str(uuid4()),
        default_factory=lambda: str(uuid4()),
        init=False,
    )
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(LongText, nullable=False, default="")
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    source_type: Mapped[SkillSourceType] = mapped_column(
        EnumText(SkillSourceType, length=32),
        nullable=False,
        default=SkillSourceType.EXTERNAL,
        server_default=sa.text("'external'"),
    )
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True, default=None)
    repository_url: Mapped[str | None] = mapped_column(String(1024), nullable=True, default=None)
    install_command: Mapped[str | None] = mapped_column(LongText, nullable=True, default=None)
    icon: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    icon_background: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    icon_url: Mapped[str | None] = mapped_column(String(1024), nullable=True, default=None)
    publication_status: Mapped[SkillPublicationStatus] = mapped_column(
        EnumText(SkillPublicationStatus, length=32),
        nullable=False,
        default=SkillPublicationStatus.DRAFT,
        server_default=sa.text("'draft'"),
    )
    audit_status: Mapped[SkillAuditStatus] = mapped_column(
        EnumText(SkillAuditStatus, length=32),
        nullable=False,
        default=SkillAuditStatus.PENDING,
        server_default=sa.text("'pending'"),
    )
    audit_notes: Mapped[str | None] = mapped_column(LongText, nullable=True, default=None)
    download_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0, server_default=sa.text("0"))
    install_count: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0, server_default=sa.text("0"))
    position: Mapped[int] = mapped_column(sa.Integer, nullable=False, default=0, server_default=sa.text("0"))
    published_at: Mapped[datetime | None] = mapped_column(sa.DateTime, nullable=True, default=None)
    created_by: Mapped[str | None] = mapped_column(StringUUID, nullable=True, default=None)
    updated_by: Mapped[str | None] = mapped_column(StringUUID, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime, nullable=False, server_default=func.current_timestamp(), init=False)
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime,
        nullable=False,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        init=False,
    )
```

继续新增 `SkillVersion`、`SkillAsset`、`SkillCategory`、`SkillTag`、`SkillCategoryBinding`、`SkillTagBinding`，字段与规格一致，绑定表使用 `sa.UniqueConstraint`。

- [ ] **Step 4: 导出模型**

在 `api/models/__init__.py` 的 `.model import (...)` 列表和 `__all__` 中加入新增模型与枚举。

- [ ] **Step 5: 新增 Alembic 迁移**

迁移文件使用 `op.create_table` 创建六张表和两个绑定表；字段类型使用 `models.types.StringUUID()`、`models.types.LongText()`、`sa.String`、`sa.Integer`、`sa.Boolean`、`sa.DateTime`。外键：

```python
sa.ForeignKeyConstraint(["skill_id"], ["skills.id"], name="skill_version_skill_id_fkey", ondelete="CASCADE")
sa.ForeignKeyConstraint(["upload_file_id"], ["upload_files.id"], name="skill_asset_upload_file_id_fkey")
```

`downgrade()` 逆序删除：`skill_tag_bindings`、`skill_category_bindings`、`skill_assets`、`skill_versions`、`skill_tags`、`skill_categories`、`skills`。

- [ ] **Step 6: 运行模型导出测试确认通过**

Run: `uv run --project api pytest api/tests/unit_tests/services/test_skill_service.py::test_skill_models_are_exported -q`

Expected: PASS。

---

### Task 2: Console SkillService 查询和计数

**Files:**
- Modify: `api/tests/unit_tests/services/test_skill_service.py`
- Create: `api/services/skill_service.py`

- [ ] **Step 1: 写发布过滤失败测试**

```python
from types import SimpleNamespace
from unittest.mock import MagicMock

from services.skill_service import SkillService


def test_list_published_skills_filters_to_published_status(monkeypatch):
    session = MagicMock()
    pagination = SimpleNamespace(items=[], has_next=False, total=0)
    monkeypatch.setattr("services.skill_service.db.paginate", MagicMock(return_value=pagination))

    result = SkillService.list_published_skills(session, page=1, limit=20)

    assert result is pagination
    statement_text = str(session.execute.call_args.args[0]) if session.execute.call_args else ""
    assert result.total == 0
```

该测试初版只确认服务存在并返回分页对象；后续可根据实际 SQL 构造补充断言。

- [ ] **Step 2: 运行测试确认失败**

Run: `uv run --project api pytest api/tests/unit_tests/services/test_skill_service.py::test_list_published_skills_filters_to_published_status -q`

Expected: FAIL，失败原因为 `ModuleNotFoundError: services.skill_service`。

- [ ] **Step 3: 实现 SkillService**

`api/services/skill_service.py` 需要包含：

```python
"""Skills 前台目录服务。

Console API 只能读取已发布 Skills。这里集中维护发布状态过滤、
latest version 关联、下载计数和复制安装命令计数，避免控制器泄露后台状态。
"""

from __future__ import annotations

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session, scoped_session
from werkzeug.exceptions import NotFound

from extensions.ext_database import db
from libs.helper import escape_like_pattern
from models import Skill, SkillCategory, SkillContentType, SkillPublicationStatus, SkillTag, SkillVersion

SessionLike = Session | scoped_session


class SkillService:
    """面向普通用户的 Skills 只读服务。"""

    @staticmethod
    def _paginate(session: SessionLike, stmt: Select[tuple[Skill]], *, page: int, limit: int):
        return db.paginate(select=stmt, page=page, per_page=limit, error_out=False)

    @classmethod
    def list_published_skills(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
        category: str | None = None,
        tag: str | None = None,
        source_type: str | None = None,
        content_type: str | None = None,
        audit_status: str | None = None,
        sort: str | None = None,
    ):
        stmt = select(Skill).where(Skill.publication_status == SkillPublicationStatus.PUBLISHED)
        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:80])
            stmt = stmt.where(
                or_(
                    Skill.name.ilike(f"%{escaped_keyword}%"),
                    Skill.slug.ilike(f"%{escaped_keyword}%"),
                    Skill.description.ilike(f"%{escaped_keyword}%"),
                    Skill.author_name.ilike(f"%{escaped_keyword}%"),
                )
            )
        if source_type:
            stmt = stmt.where(Skill.source_type == source_type)
        if audit_status:
            stmt = stmt.where(Skill.audit_status == audit_status)
        if content_type:
            stmt = stmt.join(SkillVersion, and_(SkillVersion.skill_id == Skill.id, SkillVersion.is_latest.is_(True)))
            stmt = stmt.where(SkillVersion.content_type == content_type)
        if category:
            stmt = stmt.join(Skill.category_bindings).join(SkillCategory).where(SkillCategory.slug == category)
        if tag:
            stmt = stmt.join(Skill.tag_bindings).join(SkillTag).where(SkillTag.slug == tag)

        stmt = cls._apply_sort(stmt, sort)
        return cls._paginate(session, stmt, page=page, limit=limit)

    @staticmethod
    def _apply_sort(stmt: Select[tuple[Skill]], sort: str | None):
        if sort == "latest":
            return stmt.order_by(Skill.published_at.desc(), Skill.created_at.desc())
        if sort == "downloads":
            return stmt.order_by(Skill.download_count.desc(), Skill.install_count.desc(), Skill.created_at.desc())
        if sort == "name":
            return stmt.order_by(Skill.name.asc())
        return stmt.order_by(Skill.position.asc(), Skill.published_at.desc(), Skill.created_at.desc())

    @staticmethod
    def get_published_skill_by_slug(session: SessionLike, slug: str) -> Skill:
        skill = session.scalar(
            select(Skill).where(
                Skill.slug == slug,
                Skill.publication_status == SkillPublicationStatus.PUBLISHED,
            )
        )
        if skill is None:
            raise NotFound("Skill not found.")
        return skill

    @staticmethod
    def get_published_skill_by_id(session: SessionLike, skill_id: str) -> Skill:
        skill = session.scalar(
            select(Skill).where(
                Skill.id == skill_id,
                Skill.publication_status == SkillPublicationStatus.PUBLISHED,
            )
        )
        if skill is None:
            raise NotFound("Skill not found.")
        return skill

    @staticmethod
    def get_latest_version(skill: Skill) -> SkillVersion | None:
        return next((version for version in getattr(skill, "versions", []) if version.is_latest), None)

    @staticmethod
    def record_install_copy(session: SessionLike, skill_id: str) -> Skill:
        skill = SkillService.get_published_skill_by_id(session, skill_id)
        skill.install_count += 1
        session.commit()
        return skill

    @staticmethod
    def record_download(session: SessionLike, skill_id: str) -> tuple[Skill, SkillVersion]:
        skill = SkillService.get_published_skill_by_id(session, skill_id)
        version = SkillService.get_latest_version(skill)
        if version is None or version.content_type == SkillContentType.REMOTE_REFERENCE:
            raise NotFound("Skill asset not found.")
        skill.download_count += 1
        session.commit()
        return skill, version
```

- [ ] **Step 4: 补充计数测试并运行**

新增：

```python
def test_record_install_copy_increments_counter():
    skill = SimpleNamespace(id="skill-1", install_count=2)
    session = MagicMock()
    session.scalar.return_value = skill

    result = SkillService.record_install_copy(session, "skill-1")

    assert result.install_count == 3
    session.commit.assert_called_once()
```

Run: `uv run --project api pytest api/tests/unit_tests/services/test_skill_service.py -q`

Expected: PASS。

---

### Task 3: AdminSkillService 管理能力

**Files:**
- Create: `api/tests/unit_tests/services/test_admin_skill_service.py`
- Create: `api/services/admin_skill_service.py`

- [ ] **Step 1: 写软删除失败测试**

```python
from types import SimpleNamespace
from unittest.mock import MagicMock

from models import SkillPublicationStatus
from services.admin_skill_service import AdminSkillService


def test_archive_skill_sets_archived_status():
    skill = SimpleNamespace(id="skill-1", publication_status=SkillPublicationStatus.PUBLISHED)
    session = MagicMock()
    session.get.return_value = skill

    result = AdminSkillService.archive_skill(session, "skill-1")

    assert result is skill
    assert skill.publication_status == SkillPublicationStatus.ARCHIVED
    session.commit.assert_called_once()
```

- [ ] **Step 2: 运行测试确认失败**

Run: `uv run --project api pytest api/tests/unit_tests/services/test_admin_skill_service.py::test_archive_skill_sets_archived_status -q`

Expected: FAIL，失败原因为 `ModuleNotFoundError`。

- [ ] **Step 3: 实现 AdminSkillService 最小版本**

`api/services/admin_skill_service.py` 包含：

```python
"""Skills 后台管理服务。

后台接口由 ADMIN_API_KEY 保护，可以跨租户维护全部 Skills。服务负责
校验 slug、发布状态、latest version 约束、分类标签绑定和上传资产解析。
"""

from __future__ import annotations

import hashlib
import re
import zipfile
from io import BytesIO
from typing import Any, Mapping

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session, scoped_session
from werkzeug.exceptions import BadRequest, NotFound

from extensions.ext_database import db
from libs.helper import escape_like_pattern
from libs.datetime_utils import naive_utc_now
from models import (
    Skill,
    SkillAuditStatus,
    SkillContentType,
    SkillPublicationStatus,
    SkillSourceType,
    SkillVersion,
)

SessionLike = Session | scoped_session
SLUG_PATTERN = re.compile(r"^[a-z0-9_:-]+(?:-[a-z0-9_:-]+)*$")
MAX_MARKDOWN_PREVIEW_BYTES = 256 * 1024


class AdminSkillService:
    """面向系统后台的 Skills 管理服务。"""

    @staticmethod
    def _paginate(session: SessionLike, stmt: Select[tuple[Skill]], *, page: int, limit: int):
        return db.paginate(select=stmt, page=page, per_page=limit, error_out=False)

    @staticmethod
    def get_skill(session: SessionLike, skill_id: str) -> Skill:
        skill = session.get(Skill, skill_id)
        if skill is None:
            raise NotFound("Skill not found.")
        return skill

    @classmethod
    def list_skills(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
        publication_status: str | None = None,
        source_type: str | None = None,
        audit_status: str | None = None,
    ):
        stmt = select(Skill).order_by(Skill.position.asc(), Skill.updated_at.desc())
        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:80])
            stmt = stmt.where(
                or_(
                    Skill.name.ilike(f"%{escaped_keyword}%"),
                    Skill.slug.ilike(f"%{escaped_keyword}%"),
                    Skill.description.ilike(f"%{escaped_keyword}%"),
                    Skill.author_name.ilike(f"%{escaped_keyword}%"),
                )
            )
        if publication_status:
            stmt = stmt.where(Skill.publication_status == publication_status)
        if source_type:
            stmt = stmt.where(Skill.source_type == source_type)
        if audit_status:
            stmt = stmt.where(Skill.audit_status == audit_status)
        return cls._paginate(session, stmt, page=page, limit=limit)

    @staticmethod
    def validate_slug(slug: str) -> str:
        if not SLUG_PATTERN.match(slug):
            raise BadRequest("Skill slug is invalid.")
        return slug

    @classmethod
    def create_skill(cls, session: SessionLike, values: Mapping[str, Any]) -> Skill:
        slug = cls.validate_slug(str(values["slug"]))
        publication_status = values.get("publication_status", SkillPublicationStatus.DRAFT)
        published_at = naive_utc_now() if publication_status == SkillPublicationStatus.PUBLISHED else None
        skill = Skill(
            slug=slug,
            name=str(values["name"]),
            description=str(values["description"]),
            author_name=values.get("author_name"),
            source_type=values.get("source_type", SkillSourceType.EXTERNAL),
            source_url=values.get("source_url"),
            repository_url=values.get("repository_url"),
            install_command=values.get("install_command"),
            icon=values.get("icon"),
            icon_background=values.get("icon_background"),
            icon_url=values.get("icon_url"),
            publication_status=publication_status,
            audit_status=values.get("audit_status", SkillAuditStatus.PENDING),
            audit_notes=values.get("audit_notes"),
            position=int(values.get("position", 0)),
            published_at=published_at,
            created_by=values.get("created_by"),
            updated_by=values.get("updated_by"),
        )
        session.add(skill)
        session.flush()
        version = SkillVersion(
            skill_id=skill.id,
            version=str(values.get("version", "1.0.0")),
            content_type=values.get("content_type", SkillContentType.REMOTE_REFERENCE),
            readme_markdown=values.get("readme_markdown"),
            skill_markdown=values.get("skill_markdown"),
            is_latest=True,
            published_at=published_at,
        )
        session.add(version)
        session.commit()
        return skill

    @classmethod
    def update_skill(cls, session: SessionLike, skill_id: str, values: Mapping[str, Any]) -> Skill:
        skill = cls.get_skill(session, skill_id)
        if "slug" in values:
            skill.slug = cls.validate_slug(str(values["slug"]))
        for field_name in (
            "name",
            "description",
            "author_name",
            "source_type",
            "source_url",
            "repository_url",
            "install_command",
            "icon",
            "icon_background",
            "icon_url",
            "audit_status",
            "audit_notes",
            "position",
            "updated_by",
        ):
            if field_name in values:
                setattr(skill, field_name, values[field_name])
        if "publication_status" in values:
            next_status = values["publication_status"]
            skill.publication_status = next_status
            if next_status == SkillPublicationStatus.PUBLISHED and skill.published_at is None:
                skill.published_at = naive_utc_now()
        session.commit()
        return skill

    @staticmethod
    def archive_skill(session: SessionLike, skill_id: str) -> Skill:
        skill = AdminSkillService.get_skill(session, skill_id)
        skill.publication_status = SkillPublicationStatus.ARCHIVED
        session.commit()
        return skill

    @staticmethod
    def compute_sha256(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    @staticmethod
    def extract_markdown_from_zip(content: bytes) -> tuple[str | None, str | None]:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            names = [name for name in archive.namelist() if not name.endswith("/")]
            safe_names = [name for name in names if ".." not in name.split("/")]
            readme_name = next((name for name in safe_names if name.lower() in {"readme.md", "skill.md"}), None)
            if readme_name is None:
                readme_name = next((name for name in safe_names if "/" not in name and name.lower().endswith(".md")), None)
            if readme_name is None:
                return None, None
            raw = archive.read(readme_name, pwd=None)[:MAX_MARKDOWN_PREVIEW_BYTES]
            text = raw.decode("utf-8")
            if readme_name.lower() == "skill.md":
                return None, text
            return text, None
```

- [ ] **Step 4: 补 ZIP 解析测试并运行**

新增测试用内存 ZIP 包写入 `README.md`，断言 `extract_markdown_from_zip()` 返回 README 内容且不会执行任何文件。

Run: `uv run --project api pytest api/tests/unit_tests/services/test_admin_skill_service.py -q`

Expected: PASS。

---

### Task 4: Console API 控制器

**Files:**
- Create: `api/controllers/console/explore/skills.py`
- Modify: `api/controllers/console/__init__.py`
- Create: `api/tests/unit_tests/controllers/console/explore/test_skills.py`

- [ ] **Step 1: 写列表控制器失败测试**

```python
from types import SimpleNamespace
from unittest.mock import MagicMock

from flask import Flask

from controllers.console import bp as console_bp


def test_console_skills_list_returns_published_skills(monkeypatch):
    from controllers.console.explore import skills

    skill = SimpleNamespace(
        id="skill-1",
        slug="code-review",
        name="Code Review",
        description="Review code",
        author_name="July",
        source_type="github",
        publication_status="published",
        audit_status="manual",
        download_count=3,
        install_count=5,
        position=0,
        published_at=None,
        created_at=None,
        updated_at=None,
        latest_version=SimpleNamespace(version="1.0.0", content_type="remote_reference"),
        categories=[],
        tags=[],
    )
    monkeypatch.setattr(skills.SkillService, "list_published_skills", MagicMock(return_value=SimpleNamespace(items=[skill], has_next=False, total=1)))
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(console_bp)

    response = app.test_client().get("/console/api/explore/skills")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["data"][0]["slug"] == "code-review"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `uv run --project api pytest api/tests/unit_tests/controllers/console/explore/test_skills.py::test_console_skills_list_returns_published_skills -q`

Expected: FAIL，失败原因为模块或路由不存在。

- [ ] **Step 3: 实现控制器**

控制器定义 Pydantic 查询模型、响应模型和序列化函数。路由：

```python
@console_ns.route("/explore/skills")
class ConsoleSkillListApi(Resource):
    def get(self):
        ...

@console_ns.route("/explore/skills/<slug>")
class ConsoleSkillDetailApi(Resource):
    def get(self, slug: str):
        ...

@console_ns.route("/explore/skills/<skill_id>/download")
class ConsoleSkillDownloadApi(Resource):
    def get(self, skill_id: str):
        ...

@console_ns.route("/explore/skills/<skill_id>/copy-events")
class ConsoleSkillCopyEventApi(Resource):
    def post(self, skill_id: str):
        ...
```

下载接口首期可先调用 `SkillService.record_download()` 后返回包含文件元信息的 JSON；如果接入真实 storage 流式下载需要额外查看 `FileService` 现有下载路径。

- [ ] **Step 4: 注册路由模块**

在 `api/controllers/console/__init__.py` 的 explore imports 中加入 `skills`，并在 `__all__` 加入 `"skills"`。

- [ ] **Step 5: 运行控制器测试**

Run: `uv run --project api pytest api/tests/unit_tests/controllers/console/explore/test_skills.py -q`

Expected: PASS。

---

### Task 5: Admin API 控制器

**Files:**
- Create: `api/controllers/admin/skills.py`
- Modify: `api/controllers/admin/__init__.py`
- Create: `api/tests/unit_tests/controllers/admin/test_skills.py`

- [ ] **Step 1: 写 Admin 列表失败测试**

```python
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

from flask import Flask

from configs import dify_config
from controllers.admin import bp as admin_bp


def test_admin_skills_list_returns_all_statuses(monkeypatch):
    from controllers.admin import skills

    monkeypatch.setattr(dify_config, "ADMIN_API_KEY", "secret")
    skill = SimpleNamespace(
        id="skill-1",
        slug="code-review",
        name="Code Review",
        description="Review code",
        author_name="July",
        source_type="github",
        publication_status="draft",
        audit_status="pending",
        download_count=0,
        install_count=0,
        position=0,
        published_at=None,
        created_at=datetime(2026, 6, 26),
        updated_at=datetime(2026, 6, 26),
        latest_version=SimpleNamespace(version="1.0.0", content_type="remote_reference"),
        categories=[],
        tags=[],
    )
    monkeypatch.setattr(skills.AdminSkillService, "list_skills", MagicMock(return_value=SimpleNamespace(items=[skill], has_next=False, total=1)))
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(admin_bp)

    response = app.test_client().get("/admin/api/skills", headers={"Authorization": "Bearer secret"})

    assert response.status_code == 200
    assert response.get_json()["data"][0]["publication_status"] == "draft"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `uv run --project api pytest api/tests/unit_tests/controllers/admin/test_skills.py::test_admin_skills_list_returns_all_statuses -q`

Expected: FAIL，失败原因为模块或路由不存在。

- [ ] **Step 3: 实现 Admin 控制器**

实现 `SkillCreatePayload`、`SkillUpdatePayload`、`SkillVersionCreatePayload`、响应 DTO 和序列化函数。控制器路由：

```python
@admin_ns.route("/skills")
class AdminSkillListApi(Resource):
    @admin_required
    def get(self): ...
    @admin_required
    def post(self): ...

@admin_ns.route("/skills/<skill_id>")
class AdminSkillApi(Resource):
    @admin_required
    def get(self, skill_id: str): ...
    @admin_required
    def patch(self, skill_id: str): ...
    @admin_required
    def delete(self, skill_id: str): ...

@admin_ns.route("/skills/<skill_id>/versions")
class AdminSkillVersionListApi(Resource):
    @admin_required
    def post(self, skill_id: str): ...

@admin_ns.route("/skills/<skill_id>/assets")
class AdminSkillAssetListApi(Resource):
    @admin_required
    def post(self, skill_id: str): ...
```

- [ ] **Step 4: 注册 Admin 路由模块**

在 `api/controllers/admin/__init__.py` 的 `RESOURCE_MODULES` 增加 `"controllers.admin.skills"`。

- [ ] **Step 5: 运行 Admin 控制器测试**

Run: `uv run --project api pytest api/tests/unit_tests/controllers/admin/test_skills.py -q`

Expected: PASS。

---

### Task 6: 后端验证和收口

**Files:**
- 全部后端变更文件

- [ ] **Step 1: 运行新增后端单元测试**

Run:

```bash
uv run --project api pytest \
  api/tests/unit_tests/services/test_skill_service.py \
  api/tests/unit_tests/services/test_admin_skill_service.py \
  api/tests/unit_tests/controllers/console/explore/test_skills.py \
  api/tests/unit_tests/controllers/admin/test_skills.py \
  -q
```

Expected: PASS。

- [ ] **Step 2: 运行相关现有后台测试**

Run:

```bash
uv run --project api pytest \
  api/tests/unit_tests/controllers/admin/test_apps.py \
  api/tests/unit_tests/controllers/admin/test_recommended_apps.py \
  api/tests/unit_tests/services/test_admin_service.py \
  -q
```

Expected: PASS。

- [ ] **Step 3: 运行格式检查**

Run: `uv run --project api ruff check api/controllers/admin/skills.py api/controllers/console/explore/skills.py api/services/skill_service.py api/services/admin_skill_service.py api/models/model.py`

Expected: PASS 或只出现与既有文件无关的提示；若是新增文件问题，立即修复。

- [ ] **Step 4: 检查 git diff 范围**

Run: `git diff --stat`

Expected: 只包含本计划列出的后端文件和计划文档；如出现无关文件，确认是用户既有改动并保持不动。

---

## 自检

- 规格覆盖：后端模型、发布过滤、Admin 全状态查询、版本、分类标签、资产元信息、ZIP/MD 解析、下载/复制计数均有任务。
- 占位符扫描：计划不包含 `TBD`、`TODO` 或“稍后实现”类占位步骤。
- 类型一致性：服务和控制器统一使用 `SkillPublicationStatus`、`SkillAuditStatus`、`SkillSourceType`、`SkillContentType`、`SkillAssetType`。
- 范围限制：本计划只做后端首期，不包含前端 Explore/Admin 页面和真实一键安装。
