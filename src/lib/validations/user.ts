import { z } from 'zod'

export const createUserSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  name: z.string().min(2, '姓名至少2个字符').max(50, '姓名最多50个字符'),
  password: z
    .string()
    .min(8, '密码至少8个字符')
    .regex(/[A-Z]/, '密码需包含至少一个大写字母')
    .regex(/[a-z]/, '密码需包含至少一个小写字母')
    .regex(/[0-9]/, '密码需包含至少一个数字'),
  role: z.enum(['SYSTEM_ADMIN', 'DEPT_ADMIN', 'USER']).default('USER'),
  departmentId: z.string().optional(),
})

export const updateUserSchema = z.object({
  name: z.string().min(2, '姓名至少2个字符').max(50, '姓名最多50个字符').optional(),
  role: z.enum(['SYSTEM_ADMIN', 'DEPT_ADMIN', 'USER']).optional(),
  departmentId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
})

export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, '密码至少8个字符')
    .regex(/[A-Z]/, '密码需包含至少一个大写字母')
    .regex(/[a-z]/, '密码需包含至少一个小写字母')
    .regex(/[0-9]/, '密码需包含至少一个数字'),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
