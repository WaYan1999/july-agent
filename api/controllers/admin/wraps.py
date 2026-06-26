"""系统后台鉴权装饰器。

后台 API 只能依赖 `ADMIN_API_KEY_ENABLE` 与 `ADMIN_API_KEY`，避免把 console
用户登录态、租户上下文或工作空间权限泄漏进系统级管理入口。
"""

from collections.abc import Callable
from functools import wraps

from flask import request
from werkzeug.exceptions import Unauthorized

from configs import dify_config
from libs.token import extract_access_token


def admin_required[**P, R](view: Callable[P, R]) -> Callable[P, R]:
    @wraps(view)
    def decorated(*args: P.args, **kwargs: P.kwargs) -> R:
        if not dify_config.ADMIN_API_KEY_ENABLE:
            raise Unauthorized("Admin API key authentication is disabled.")

        if not dify_config.ADMIN_API_KEY:
            raise Unauthorized("API key is invalid.")

        auth_token = extract_access_token(request)
        if not auth_token:
            raise Unauthorized("Authorization header is missing.")
        if auth_token != dify_config.ADMIN_API_KEY:
            raise Unauthorized("API key is invalid.")

        return view(*args, **kwargs)

    return decorated
