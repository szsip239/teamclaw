# Contributing to TeamClaw

Thank you for your interest in contributing! This guide will help you get started.

## Development Environment Setup

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Git

### Quick Start

```bash
# Clone the repository
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw

# Start PostgreSQL and Redis
docker compose up -d

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Set up environment
cp .env.example .env
node scripts/generate-keys.mjs  # Generates JWT keys

# Push database schema & seed
npx prisma db push
npx tsx prisma/seed.ts

# Start dev server
npm run dev
```

Visit `http://localhost:3000` — Login: `admin@teamclaw.local` / `Admin@123456`

## Project Structure

```
src/
├── app/              # Next.js App Router pages & API routes
│   ├── (auth)/       # Login / Register pages
│   ├── (dashboard)/  # Protected dashboard pages
│   └── api/v1/       # REST API endpoints
├── components/       # React components (shadcn/ui based)
├── lib/              # Server-side business logic
├── stores/           # Zustand state stores
├── locales/          # i18n translation files (en.ts, zh-CN.ts)
├── hooks/            # Custom React hooks
└── generated/prisma/ # Prisma generated client (gitignored)
```

## Development Guidelines

### Branching

- `main` — stable release branch
- `feat/<name>` — new features
- `fix/<name>` — bug fixes
- `docs/<name>` — documentation updates

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add multi-agent chat support
fix: resolve token refresh race condition
docs: update deployment guide
refactor: simplify gateway connection logic
```

### i18n Rules (Mandatory)

TeamClaw supports Chinese and English. **All user-facing text must be internationalized.**

#### In Components (`src/components/`, `src/app/`)

```tsx
// CORRECT
const t = useT()
return <h1>{t('dashboard.title')}</h1>

// WRONG - never hardcode Chinese
return <h1>仪表盘</h1>
```

- Add keys to **both** `src/locales/en.ts` and `src/locales/zh-CN.ts`
- Run `npx tsx scripts/check-i18n.ts` to verify key sync

#### In Library Code (`src/lib/`)

Use the `BiText` type for domain knowledge text:

```ts
// CORRECT
const label: BiText = { zh: '模型提供商', en: 'Model Provider' }

// WRONG
const label = '模型提供商'
```

### Code Style

- TypeScript strict mode
- ESLint + Prettier (run `npm run lint` and `npm run format`)
- Use `@/` import alias for `src/*`
- Prefer server components; use `'use client'` only when needed

### Testing

```bash
npm test          # Run all tests
npm run test:watch # Watch mode
```

## Pull Request Process

1. Fork the repository and create your branch from `main`
2. Make your changes with appropriate tests
3. Ensure `tsc --noEmit` passes (no type errors)
4. Ensure `npx tsx scripts/check-i18n.ts` passes (i18n keys in sync)
5. Run `npm run lint` and fix any issues
6. Submit a PR with a clear description of changes

### PR Checklist

- [ ] Code compiles without errors (`tsc --noEmit`)
- [ ] i18n keys are synchronized
- [ ] No hardcoded Chinese in components
- [ ] New API routes have proper auth checks
- [ ] Sensitive data is not logged or exposed

## Need Help?

- Open a [Discussion](https://github.com/szsip239/teamclaw/discussions) for questions
- Check existing [Issues](https://github.com/szsip239/teamclaw/issues) before creating new ones

---

# 贡献指南

感谢您对 TeamClaw 的贡献兴趣！

## 关键规则

- **国际化**：组件中禁止硬编码中文，必须使用 `useT()` + `t('key')` 翻译函数
- **双语同步**：新增翻译 key 时，`en.ts` 和 `zh-CN.ts` 必须同步添加
- **提交规范**：使用 Conventional Commits 格式
- **类型安全**：提交前确保 `tsc --noEmit` 通过

详细的开发环境搭建和代码规范请参阅上方英文部分。
