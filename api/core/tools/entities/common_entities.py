from typing import TypedDict

from pydantic import BaseModel, Field, model_validator


class I18nObjectDict(TypedDict):
    zh_Hans: str | None
    en_US: str


class I18nObject(BaseModel):
    """
    仅保留英文和简体中文的国际化文本对象。
    """

    en_US: str
    zh_Hans: str | None = Field(default=None)

    @model_validator(mode="after")
    def _populate_missing_locales(self):
        self.zh_Hans = self.zh_Hans or self.en_US
        return self

    def to_dict(self) -> I18nObjectDict:
        result: I18nObjectDict = {
            "zh_Hans": self.zh_Hans,
            "en_US": self.en_US,
        }
        return result
