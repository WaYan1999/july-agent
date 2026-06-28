import fs from 'node:fs'
import path, { normalize, sep } from 'node:path'

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure non-English JSON files don\'t have extra keys not present in en-US',
    },
    fixable: 'code',
  },
  create(context) {
    return {
      Program(node) {
        const { filename, sourceCode } = context

        if (!filename.endsWith('.json'))
          return

        const parts = normalize(filename).split(sep)
        // 例如 i18n/zh-Hans/common.json 会解析为 jsonFile = common.json、lang = zh-Hans。
        const jsonFile = parts.at(-1)
        const lang = parts.at(-2)

        // Skip English files
        if (lang === 'en-US')
          return

        let currentJson = {}
        let englishJson = {}

        try {
          currentJson = JSON.parse(sourceCode.text)
          // 在 en-US 目录中查找同名文件。
          // 例如 i18n/zh-Hans/common.json 对应 i18n/en-US/common.json。
          const englishFilePath = path.join(path.dirname(filename), '..', 'en-US', jsonFile ?? '')
          englishJson = JSON.parse(fs.readFileSync(englishFilePath, 'utf8'))
        }
        catch (error) {
          context.report({
            node,
            message: `Error parsing JSON: ${error instanceof Error ? error.message : String(error)}`,
          })
          return
        }

        const extraKeys = Object.keys(currentJson).filter(
          key => !Object.prototype.hasOwnProperty.call(englishJson, key),
        )

        for (const key of extraKeys) {
          context.report({
            node,
            message: `Key "${key}" is present in ${lang}/${jsonFile} but not in en-US/${jsonFile}`,
            fix(fixer) {
              const newJson = Object.fromEntries(
                Object.entries(currentJson).filter(([k]) => !extraKeys.includes(k)),
              )

              const newText = `${JSON.stringify(newJson, null, 2)}\n`

              return fixer.replaceText(node, newText)
            },
          })
        }
      },
    }
  },
}
