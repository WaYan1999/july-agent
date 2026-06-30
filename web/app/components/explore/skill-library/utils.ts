export function getDisplaySourceUrl(sourceUrl: string | null | undefined) {
  if (!sourceUrl)
    return ''

  try {
    const url = new URL(sourceUrl)
    const hasPath = url.pathname.replace(/\/+$/, '') !== ''
    if (!hasPath && !url.search && !url.hash)
      return ''
    const path = url.pathname.replace(/^\/+/, '').replace(/\/$/, '')
    if (url.hostname.toLowerCase() === 'github.com')
      return path || ''
    return `${url.hostname}${path ? `/${path}` : ''}${url.search}${url.hash}`
  }
  catch {
    return sourceUrl
  }
}

export function stripSkillMetadataBlock(markdown: string | null | undefined) {
  if (!markdown)
    return markdown

  const normalizedMarkdown = markdown.replace(/\r\n/g, '\n')
  const lines = normalizedMarkdown.split('\n')
  const firstContentIndex = lines.findIndex(line => line.trim() !== '')
  if (firstContentIndex === -1)
    return ''

  if (lines[firstContentIndex]?.trim() === '---') {
    const endIndex = lines.findIndex((line, index) => index > firstContentIndex && line.trim() === '---')
    if (endIndex !== -1)
      return lines.slice(endIndex + 1).join('\n').trimStart()
  }

  const firstLine = lines[firstContentIndex]?.trim() ?? ''
  if (!/^(?:name|description|license|metadata|author|version)\s*:/i.test(firstLine))
    return markdown

  const endIndex = lines.findIndex((line, index) => {
    if (index <= firstContentIndex)
      return false
    const trimmedLine = line.trim()
    return trimmedLine === '' || /^#{1,6}\s+/.test(trimmedLine)
  })

  if (endIndex === -1)
    return ''

  const contentStartIndex = lines[endIndex]?.trim() === '' ? endIndex + 1 : endIndex
  return lines.slice(contentStartIndex).join('\n').trimStart()
}
