from datetime import datetime

from flask import request
from flask_restx import Resource
from pydantic import BaseModel, ConfigDict, Field, field_validator

from controllers.admin import admin_ns
from controllers.admin.common import TimestampedResponse, normalize_enum_value
from controllers.admin.wraps import admin_required
from controllers.common.schema import query_params_from_model, register_response_schema_models, register_schema_models
from extensions.ext_database import db
from fields.base import ResponseModel
from libs.helper import dump_response, to_timestamp
from models.account import AccountStatus, TenantAccountRole
from services.admin_service import AdminService


class AccountListQuery(BaseModel):
    page: int = Field(default=1, ge=1, le=99999)
    limit: int = Field(default=20, ge=1, le=100)
    keyword: str | None = Field(default=None, max_length=50)
    status: AccountStatus | None = None
    workspace_id: str | None = None
    role: TenantAccountRole | None = None


class AccountUpdatePayload(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = Field(default=None, min_length=1, max_length=255)
    interface_language: str | None = Field(default=None, max_length=255)
    interface_theme: str | None = Field(default=None, max_length=255)
    timezone: str | None = Field(default=None, max_length=255)
    status: AccountStatus | None = None

    model_config = ConfigDict(extra="forbid")


class WorkspaceMembershipResponse(ResponseModel):
    tenant_id: str
    tenant_name: str | None = None
    tenant_status: str | None = None
    role: str | None = None
    current: bool
    joined_at: int | None = None
    last_opened_at: int | None = None

    @field_validator("tenant_status", "role", mode="before")
    @classmethod
    def _normalize_enum_like(cls, value: object) -> str | None:
        return normalize_enum_value(value)

    @field_validator("joined_at", "last_opened_at", mode="before")
    @classmethod
    def _normalize_timestamp(cls, value: datetime | int | None) -> int | None:
        return to_timestamp(value)


class AccountResponse(TimestampedResponse):
    id: str
    name: str | None = None
    email: str | None = None
    avatar: str | None = None
    interface_language: str | None = None
    interface_theme: str | None = None
    timezone: str | None = None
    status: str | None = None
    initialized_at: int | None = None
    last_login_at: int | None = None
    last_login_ip: str | None = None
    last_active_at: int | None = None
    workspace_count: int | None = None
    workspaces: list[WorkspaceMembershipResponse] = Field(default_factory=list)

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, value: object) -> str | None:
        return normalize_enum_value(value)

    @field_validator("initialized_at", "last_login_at", "last_active_at", mode="before")
    @classmethod
    def _normalize_optional_timestamp(cls, value: datetime | int | None) -> int | None:
        return to_timestamp(value)


class AccountPaginationResponse(ResponseModel):
    data: list[AccountResponse]
    has_more: bool
    limit: int
    page: int
    total: int


register_schema_models(admin_ns, AccountListQuery, AccountUpdatePayload)
register_response_schema_models(admin_ns, AccountResponse, AccountPaginationResponse, WorkspaceMembershipResponse)


def _serialize_memberships(account_id: str) -> list[dict[str, object]]:
    memberships = []
    for membership, tenant in AdminService.get_account_workspace_memberships(db.session, account_id):
        memberships.append(
            {
                "tenant_id": membership.tenant_id,
                "tenant_name": tenant.name,
                "tenant_status": tenant.status,
                "role": membership.role,
                "current": membership.current,
                "joined_at": membership.created_at,
                "last_opened_at": membership.last_opened_at,
            }
        )
    return memberships


def _serialize_account(account, *, include_workspaces: bool = False) -> dict[str, object]:
    data = {
        "id": account.id,
        "name": account.name,
        "email": account.email,
        "avatar": account.avatar,
        "interface_language": account.interface_language,
        "interface_theme": account.interface_theme,
        "timezone": account.timezone,
        "status": account.status,
        "initialized_at": account.initialized_at,
        "last_login_at": account.last_login_at,
        "last_login_ip": account.last_login_ip,
        "last_active_at": account.last_active_at,
        "created_at": account.created_at,
        "updated_at": account.updated_at,
    }
    if include_workspaces:
        data["workspaces"] = _serialize_memberships(account.id)
        data["workspace_count"] = len(data["workspaces"])
    else:
        data["workspace_count"] = AdminService.count_account_workspaces(db.session, account.id)
    return data


@admin_ns.route("/accounts")
class AdminAccountListApi(Resource):
    @admin_ns.doc(params=query_params_from_model(AccountListQuery))
    @admin_ns.response(200, "Success", admin_ns.models[AccountPaginationResponse.__name__])
    @admin_required
    def get(self):
        query = AccountListQuery.model_validate(request.args.to_dict(flat=True))
        pagination = AdminService.list_accounts(
            db.session,
            page=query.page,
            limit=query.limit,
            keyword=query.keyword,
            status=query.status,
            workspace_id=query.workspace_id,
            role=query.role,
        )
        return dump_response(
            AccountPaginationResponse,
            {
                "data": [_serialize_account(account, include_workspaces=True) for account in pagination.items],
                "has_more": pagination.has_next,
                "limit": query.limit,
                "page": query.page,
                "total": pagination.total,
            },
        )


@admin_ns.route("/accounts/<account_id>")
class AdminAccountApi(Resource):
    @admin_ns.response(200, "Success", admin_ns.models[AccountResponse.__name__])
    @admin_required
    def get(self, account_id: str):
        account = AdminService.get_account(db.session, account_id)
        return dump_response(AccountResponse, _serialize_account(account, include_workspaces=True))

    @admin_ns.expect(admin_ns.models[AccountUpdatePayload.__name__])
    @admin_ns.response(200, "Success", admin_ns.models[AccountResponse.__name__])
    @admin_required
    def patch(self, account_id: str):
        payload = AccountUpdatePayload.model_validate(admin_ns.payload or {})
        account = AdminService.update_account(db.session, account_id, payload.model_dump(exclude_unset=True))
        return dump_response(AccountResponse, _serialize_account(account, include_workspaces=True))

    @admin_ns.response(204, "Account closed")
    @admin_required
    def delete(self, account_id: str):
        AdminService.close_account(db.session, account_id)
        return "", 204
