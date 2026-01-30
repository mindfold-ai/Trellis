# Frontend Check - Not Applicable

**This project** (`@mindfoldhq/trellis`) is a **pure CLI tool** with no frontend.

---

## If You're Looking For

| Need | Use Instead |
|------|-------------|
| Code quality checks | `/trellis:check-backend` |
| TypeScript/ESLint | `pnpm lint && pnpm typecheck` |
| Development guidelines | `.trellis/spec/backend/` |

---

## Note for Template Users

If you're using Trellis in a project **with a frontend**, you should:

1. Fill in `.trellis/spec/frontend/` with your frontend guidelines
2. Update this file with your frontend-specific checks
3. Add your frontend lint/test commands

Example for a React project:
```bash
pnpm lint:frontend
pnpm test:frontend
pnpm typecheck
```
