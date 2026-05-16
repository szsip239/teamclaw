const USER_QUESTION_MARKER = '\n[User Question]\n'
const RAG_HEADER_RE = /\[(?:System Rules|Internal Knowledge|External References)[^\]]*\]/

export function stripRagContextForDisplay(text: string): string {
  const markerIndex = text.lastIndexOf(USER_QUESTION_MARKER)
  if (markerIndex === -1) return text

  const context = text.slice(0, markerIndex)
  if (!RAG_HEADER_RE.test(context)) return text

  return text.slice(markerIndex + USER_QUESTION_MARKER.length).trimStart()
}
