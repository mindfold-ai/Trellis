Check if the code you just wrote follows the backend development guidelines.

Execute these steps:
1. Run `git status` to see modified files
2. Read `.trellis/spec/backend/index.md` to understand which guidelines apply
3. Based on what you changed, read the relevant guideline files:
   - Database changes → `.trellis/spec/backend/database-guidelines.md`
   - Error handling → `.trellis/spec/backend/error-handling.md`
   - Logging changes → `.trellis/spec/backend/logging-guidelines.md`
   - Any changes → `.trellis/spec/backend/quality-guidelines.md`
4. Check if tests need to be added or updated (see `.trellis/spec/unit-test/conventions.md` "When to Write Tests"):
   - New pure function → needs unit test
   - Bug fix → needs regression test
   - Changed init/update behavior → needs integration test update
5. Review your code against the guidelines
6. Report any violations and fix them if found
