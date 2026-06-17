export interface SessionFileEntry {
  name: string
  path: string
  sourceSessionId?: string
  type: 'file' | 'directory'
  size: number
}

export interface SessionFileListResponse {
  files: SessionFileEntry[]
  zone: 'input' | 'output'
  dir: string
}
