# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in TeamClaw, please report it responsibly:

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email your findings to the project maintainers
3. Include detailed steps to reproduce the vulnerability
4. Allow reasonable time for a fix before public disclosure

### What to include in your report

- Type of vulnerability (e.g., SQL injection, XSS, authentication bypass)
- Steps to reproduce the issue
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Fix & Release**: Depends on severity, typically within 2 weeks for critical issues

## Security Best Practices

When deploying TeamClaw:

- Always change default admin credentials after first login
- Use strong, unique values for `JWT_PRIVATE_KEY` and `ENCRYPTION_KEY`
- Run behind a reverse proxy (Nginx/Caddy) with HTTPS in production
- Keep Docker images updated
- Restrict Docker socket access (`/var/run/docker.sock`)
- Use network segmentation between public-facing and internal services

---

# 安全策略

## 报告漏洞

如果您发现 TeamClaw 的安全漏洞，请通过以下方式负责任地报告：

1. **不要**在 GitHub 上创建公开 issue
2. 通过邮件联系项目维护者
3. 提供详细的复现步骤
4. 在公开披露前给予合理的修复时间

## 部署安全建议

- 首次登录后立即修改默认管理员密码
- 为 `JWT_PRIVATE_KEY` 和 `ENCRYPTION_KEY` 使用强随机值
- 生产环境使用反向代理（Nginx/Caddy）配置 HTTPS
- 定期更新 Docker 镜像
- 限制 Docker socket 访问权限
