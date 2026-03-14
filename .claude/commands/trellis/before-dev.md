Read the relevant development guidelines before starting your task.

Execute these steps:

1. **Discover packages and their spec layers**:
   ```bash
   python3 ./.trellis/scripts/get_context.py --mode packages
   ```

2. **Identify which specs apply** to your task based on:
   - Which AOSP module you're modifying (e.g., `systemui`, `launcher`, `framework`)
   - What type of work (architecture, quality, security, build/debug, etc.)

3. **Read the spec index** for each relevant module:
   ```bash
   cat .trellis/spec/<package>/<layer>/index.md
   ```
   Follow the **"Pre-Development Checklist"** section in the index.

4. **Read the specific guideline files** listed in the Pre-Development Checklist that are relevant to your task. The index is NOT the goal — it points you to the actual guideline files (e.g., `error-handling.md`, `conventions.md`, `mock-strategies.md`). Read those files to understand the coding standards and patterns.

5. **Always read shared guides**:
   ```bash
   cat .trellis/spec/guides/index.md
   ```

6. Understand the coding standards and patterns you need to follow, then proceed with your development plan.

This step is **mandatory** before writing any code.
