language_timezone_mapping = {
    "en-US": "America/New_York",
    "zh-Hans": "Asia/Shanghai",
}

languages = list(language_timezone_mapping.keys())


def supported_language(lang):
    if lang in languages:
        return lang

    error = f"{lang} is not a valid language."
    raise ValueError(error)


def get_valid_language(lang: str | None) -> str:
    if lang and lang in languages:
        return lang
    return languages[0]
