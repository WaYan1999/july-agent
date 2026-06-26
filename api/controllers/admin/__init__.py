"""独立系统后台 API 入口。

后台接口固定挂载在 `/admin/api`，只接受 `ADMIN_API_KEY` 鉴权，不读取
console 登录态、当前账号或当前工作空间。资源模块在这里集中导入，确保
Flask-RESTX route decorator 在 blueprint 注册前完成求值。
"""

from importlib import import_module

from flask import Blueprint
from flask_restx import Namespace

from libs.external_api import ExternalApi

bp = Blueprint("admin", __name__, url_prefix="/admin/api")

api = ExternalApi(
    bp,
    version="1.0",
    title="System Admin API",
    description="System-level administration APIs isolated from console APIs",
)

admin_ns = Namespace("admin", description="System administration API operations", path="/")

RESOURCE_MODULES: tuple[str, ...] = (
    "controllers.admin.accounts",
    "controllers.admin.apps",
    "controllers.admin.recommended_apps",
    "controllers.admin.skills",
)

for module_name in RESOURCE_MODULES:
    import_module(module_name)

api.add_namespace(admin_ns)

__all__ = ["admin_ns", "api", "bp"]
