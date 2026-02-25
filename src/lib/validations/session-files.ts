import { z } from 'zod'

// Path safety check - no .., no null bytes, not absolute
const safeRelativePath = z.string()
  .min(1, '路径不能为空')
  .max(500, '路径过长')
  .refine(p => !p.includes('..'), '路径不允许包含 ..')
  .refine(p => !p.includes('\0'), '路径包含无效字符')
  .refine(p => !p.startsWith('/'), '路径不能为绝对路径')

export const mkdirSchema = z.object({
  dir: safeRelativePath,
})

export const moveSchema = z.object({
  source: safeRelativePath,
  target: safeRelativePath,
})

export type MkdirInput = z.infer<typeof mkdirSchema>
export type MoveInput = z.infer<typeof moveSchema>
