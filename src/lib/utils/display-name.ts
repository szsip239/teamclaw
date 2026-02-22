/**
 * Get a user-friendly display name.
 * Falls back to email local part if name equals email.
 */
export function getDisplayName(user: { name: string; email?: string | null }): string {
  if (user.email && user.name === user.email) {
    return user.email.split('@')[0]
  }
  return user.name || '未知用户'
}
