const SPLIT_LANGUAGE_FENCE = /```[ \t]*\r?\n[ \t]*(echarts|mermaid)[ \t]*\r?\n/gi

export function normalizeChatMarkdown(content: string): string {
  return content.replace(SPLIT_LANGUAGE_FENCE, (_match, lang: string) => {
    return `\`\`\`${lang.toLowerCase()}\n`
  })
}
