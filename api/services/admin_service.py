"""系统后台资源管理服务。

这里承载 `/admin/api/*` 的跨租户管理逻辑。调用方必须已经完成
`ADMIN_API_KEY` 鉴权；本服务不读取 console 登录态，也不依赖当前工作空间。
"""

from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any, cast

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, scoped_session
from werkzeug.exceptions import NotFound

from extensions.ext_database import db
from libs.helper import escape_like_pattern
from models.account import Account, AccountStatus, Tenant, TenantAccountJoin, TenantAccountRole
from models.model import App, RecommendedApp
from services import app_service as app_service_module
from services.app_service import AppService

SessionLike = Session | scoped_session


class AdminService:
    """系统后台资源查询与变更服务。"""

    @staticmethod
    def _paginate(session: SessionLike, stmt: Select[tuple[Any]], *, page: int, limit: int):
        return db.paginate(select=stmt, page=page, per_page=limit, error_out=False)

    @classmethod
    def list_accounts(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
        status: AccountStatus | None = None,
        workspace_id: str | None = None,
        role: TenantAccountRole | None = None,
    ):
        stmt = select(Account).order_by(Account.created_at.desc())

        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:50])
            stmt = stmt.where(
                or_(
                    Account.name.ilike(f"%{escaped_keyword}%"),
                    Account.email.ilike(f"%{escaped_keyword}%"),
                )
            )
        if status:
            stmt = stmt.where(Account.status == status)
        if workspace_id or role:
            stmt = stmt.join(TenantAccountJoin, TenantAccountJoin.account_id == Account.id)
            if workspace_id:
                stmt = stmt.where(TenantAccountJoin.tenant_id == workspace_id)
            if role:
                stmt = stmt.where(TenantAccountJoin.role == role)
            stmt = stmt.distinct()

        return cls._paginate(session, stmt, page=page, limit=limit)

    @staticmethod
    def get_account(session: SessionLike, account_id: str) -> Account:
        account = session.get(Account, account_id)
        if account is None:
            raise NotFound("Account not found.")
        return account

    @staticmethod
    def get_account_workspace_memberships(
        session: SessionLike,
        account_id: str,
    ) -> list[tuple[TenantAccountJoin, Tenant]]:
        stmt = (
            select(TenantAccountJoin, Tenant)
            .join(Tenant, Tenant.id == TenantAccountJoin.tenant_id)
            .where(TenantAccountJoin.account_id == account_id)
            .order_by(TenantAccountJoin.created_at.desc())
        )
        return list(session.execute(stmt).all())

    @staticmethod
    def update_account(session: SessionLike, account_id: str, values: Mapping[str, Any]) -> Account:
        account = AdminService.get_account(session, account_id)

        for field_name in ("name", "email", "interface_language", "interface_theme", "timezone", "status"):
            if field_name in values:
                setattr(account, field_name, values[field_name])

        session.commit()
        return account

    @staticmethod
    def close_account(session: SessionLike, account_id: str) -> Account:
        account = AdminService.get_account(session, account_id)
        account.status = AccountStatus.CLOSED
        session.commit()
        return account

    @classmethod
    def list_recommended_apps(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
        language: str | None = None,
        is_listed: bool | None = None,
        is_learn_dify: bool | None = None,
    ):
        stmt = select(RecommendedApp).order_by(RecommendedApp.position.asc(), RecommendedApp.created_at.desc())
        if language:
            stmt = stmt.where(RecommendedApp.language == language)
        if is_listed is not None:
            stmt = stmt.where(RecommendedApp.is_listed.is_(is_listed))
        if is_learn_dify is not None:
            stmt = stmt.where(RecommendedApp.is_learn_dify.is_(is_learn_dify))
        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:50])
            stmt = stmt.join(App, App.id == RecommendedApp.app_id).where(App.name.ilike(f"%{escaped_keyword}%"))

        return cls._paginate(session, stmt, page=page, limit=limit)

    @staticmethod
    def get_recommended_app(session: SessionLike, recommended_app_id: str) -> RecommendedApp:
        recommended_app = session.get(RecommendedApp, recommended_app_id)
        if recommended_app is None:
            raise NotFound("Recommended app not found.")
        return recommended_app

    @staticmethod
    def update_recommended_app(
        session: SessionLike,
        recommended_app_id: str,
        values: Mapping[str, Any],
    ) -> RecommendedApp:
        recommended_app = AdminService.get_recommended_app(session, recommended_app_id)

        if "categories" in values:
            categories = list(cast(Sequence[str], values["categories"]))
            recommended_app.categories = categories
            recommended_app.category = categories[0] if categories else ""
        for field_name in ("position", "is_listed", "is_learn_dify", "custom_disclaimer"):
            if field_name in values:
                setattr(recommended_app, field_name, values[field_name])

        site_values = values.get("site")
        app = recommended_app.app
        site = app.site if app is not None else None
        if isinstance(site_values, Mapping) and site is not None:
            for field_name in ("title", "description", "copyright", "privacy_policy", "custom_disclaimer"):
                if field_name in site_values:
                    setattr(site, field_name, site_values[field_name])

        session.commit()
        return recommended_app

    @staticmethod
    def unlist_recommended_app(session: SessionLike, recommended_app_id: str) -> RecommendedApp:
        recommended_app = AdminService.get_recommended_app(session, recommended_app_id)
        recommended_app.is_listed = False
        session.commit()
        return recommended_app

    @classmethod
    def list_apps(
        cls,
        session: SessionLike,
        *,
        page: int,
        limit: int,
        keyword: str | None = None,
        tenant_id: str | None = None,
        mode: str | None = None,
        status: str | None = None,
        is_public: bool | None = None,
        enable_site: bool | None = None,
        enable_api: bool | None = None,
    ):
        stmt = select(App).order_by(App.updated_at.desc())
        if keyword:
            escaped_keyword = escape_like_pattern(keyword[:50])
            stmt = stmt.where(
                or_(
                    App.name.ilike(f"%{escaped_keyword}%"),
                    App.description.ilike(f"%{escaped_keyword}%"),
                )
            )
        if tenant_id:
            stmt = stmt.where(App.tenant_id == tenant_id)
        if mode:
            stmt = stmt.where(App.mode == mode)
        if status:
            stmt = stmt.where(App.status == status)
        if is_public is not None:
            stmt = stmt.where(App.is_public.is_(is_public))
        if enable_site is not None:
            stmt = stmt.where(App.enable_site.is_(enable_site))
        if enable_api is not None:
            stmt = stmt.where(App.enable_api.is_(enable_api))

        return cls._paginate(session, stmt, page=page, limit=limit)

    @staticmethod
    def get_app(session: SessionLike, app_id: str) -> App:
        app = session.get(App, app_id)
        if app is None:
            raise NotFound("App not found.")
        return app

    @staticmethod
    def update_app(session: SessionLike, app_id: str, values: Mapping[str, Any]) -> App:
        app = AdminService.get_app(session, app_id)
        operator = SimpleNamespace(id="system-admin")

        identity_fields = {"name", "description", "icon_type", "icon", "icon_background", "max_active_requests"}
        if any(field_name in values for field_name in identity_fields):
            args: AppService.ArgsDict = {
                "name": values.get("name", app.name),
                "description": values.get("description", app.description),
                "icon_type": values.get("icon_type", app.icon_type),
                "icon": values.get("icon", app.icon),
                "icon_background": values.get("icon_background", app.icon_background),
                "use_icon_as_answer_icon": values.get("use_icon_as_answer_icon", app.use_icon_as_answer_icon),
                "max_active_requests": values.get("max_active_requests", app.max_active_requests),
            }
            with patched_current_user(operator):
                app = AppService().update_app(app, args)

        if "enable_site" in values:
            with patched_current_user(operator):
                app = AppService().update_app_site_status(app, values["enable_site"])
        if "enable_api" in values:
            with patched_current_user(operator):
                app = AppService().update_app_api_status(app, values["enable_api"])

        direct_changed = False
        for field_name in ("is_public", "maintainer", "api_rpm", "api_rph"):
            if field_name in values:
                setattr(app, field_name, values[field_name])
                direct_changed = True
        if direct_changed:
            app.updated_by = operator.id
            session.commit()

        return app

    @staticmethod
    def delete_app(session: SessionLike, app_id: str) -> None:
        app = AdminService.get_app(session, app_id)
        with patched_current_user(SimpleNamespace(id="system-admin")):
            AppService().delete_app(app)

    @staticmethod
    def count_account_workspaces(session: SessionLike, account_id: str) -> int:
        return (
            session.scalar(select(func.count(TenantAccountJoin.id)).where(TenantAccountJoin.account_id == account_id))
            or 0
        )


@contextmanager
def patched_current_user(user: SimpleNamespace) -> Iterator[None]:
    """临时把 AppService 需要的 current_user 设置为后台系统操作者。"""

    original = app_service_module.current_user
    app_service_module.current_user = user
    try:
        yield
    finally:
        app_service_module.current_user = original
