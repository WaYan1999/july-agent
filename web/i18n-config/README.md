# Internationalization (i18n)

## Overview

This project only maintains English and Simplified Chinese interface languages.
Translation files live under `web/i18n` and must be limited to:

- `en-US`
- `zh-Hans`

## File Structure

```txt
web/i18n
├── en-US
│   ├── app.json
│   ├── app-debug.json
│   ├── common.json
│   └── ...
└── zh-Hans
    └── ...

web/i18n-config
├── language.ts
├── languages.ts
└── ...
```

English is the default language. Translation files are organized by language and then by module. For example, the English translation for the `app` module is in `web/i18n/en-US/app.json`.

Translation files are JSON with flat keys (dot notation). i18next is configured with `keySeparator: false`, so dots are part of the key. The namespace is the camelCase file name (for example, `app-debug.json` -> `appDebug`), so use `useTranslation('appDebug')` or `t('key', { ns: 'appDebug' })`.

## Language List

Supported interface languages are defined in `web/i18n-config/languages.ts`. Do not add other interface languages unless the project policy changes.

```typescript
const data = {
  languages: [
    {
      value: 'en-US',
      name: 'English (United States)',
      prompt_name: 'English',
      example: 'Hello, July!',
      supported: true,
    },
    {
      value: 'zh-Hans',
      name: '简体中文',
      prompt_name: 'Chinese Simplified',
      example: '你好，July！',
      supported: true,
    },
  ],
} as const
```

`LanguagesSupported` is derived from this list and is used by the login page, settings page, and server locale matching.

## Utility Scripts

- Check missing/extra keys: `pnpm run i18n:check --file app billing --lang zh-Hans [--auto-remove]`
  - Use space-separated values; repeat `--file` / `--lang` as needed.
  - The script returns non-zero on missing/extra keys.
  - `--auto-remove` deletes extra keys automatically.

## Maintenance Rules

- Add or rename keys in both `web/i18n/en-US` and `web/i18n/zh-Hans`.
- Keep namespace file names aligned between the two language folders.
- Do not add new language folders or language options without updating the project policy first.
