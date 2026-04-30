# MDX Guidelines

> MDX syntax, frontmatter, and component usage patterns.

---

## Frontmatter

Every MDX file must start with frontmatter:

```yaml
---
title: 'Page Title'
description: 'Brief description for SEO (150-160 characters)'
---
```

### Optional Frontmatter Fields

| Field          | Purpose                   | Example         |
| -------------- | ------------------------- | --------------- |
| `sidebarTitle` | Shorter title for sidebar | `"Quick Start"` |
| `icon`         | Navigation icon           | `"rocket"`      |
| `tag`          | Badge/label               | `"NEW"`         |
| `mode`         | Page mode                 | `"wide"`        |

### Example with All Fields

```yaml
---
title: 'Getting Started with the API'
description: 'Learn how to authenticate and make your first API call'
sidebarTitle: 'Getting Started'
icon: 'play'
tag: 'Updated'
---
```

---

## Components

### Card

Use for navigation links and feature highlights:

```mdx
<Card title="Quick Start" icon="rocket" href="/quickstart">
  Get up and running in 5 minutes.
</Card>
```

**Horizontal variant:**

```mdx
<Card title="Start Here" icon="rocket" href="/quickstart" horizontal>
  Follow our quickstart guide.
</Card>
```

### Columns

Use for multi-column layouts:

```mdx
<Columns cols={2}>
  <Card title="First" icon="star" href="/first">
    First card content.
  </Card>
  <Card title="Second" icon="star" href="/second">
    Second card content.
  </Card>
</Columns>
```

### Tabs

Use for alternative content views:

````mdx
<Tabs>
  <Tab title="npm">```bash npm install package-name ```</Tab>
  <Tab title="yarn">```bash yarn add package-name ```</Tab>
</Tabs>
````

### Accordion

Use for collapsible content:

```mdx
<AccordionGroup>
  <Accordion title="What is Mintlify?">Mintlify is a documentation platform.</Accordion>
  <Accordion title="How much does it cost?">
    Free tier available, Pro starts at $300/month.
  </Accordion>
</AccordionGroup>
```

### CodeGroup

Use for multi-language code examples:

````mdx
<CodeGroup>
```javascript Node.js
const response = await fetch('/api/users');
```

```python Python
response = requests.get('/api/users')
```

```bash cURL
curl https://api.example.com/users
```

</CodeGroup>
````

### Snippet

Use for reusable content:

```mdx
<Snippet file="api-key-setup.mdx" />
```

---

## Code Blocks

### Basic Syntax

````markdown
```language filename
code here
```
````

### With Filename

````markdown
```javascript app.js
const express = require('express');
const app = express();
```
````

### Supported Languages

Common: `javascript`, `typescript`, `python`, `bash`, `json`, `yaml`, `sql`, `go`, `rust`

---

## Callouts

### Note

```mdx
<Note>This is important information.</Note>
```

### Warning

```mdx
<Warning>Be careful with this action.</Warning>
```

### Info

```mdx
<Info>Additional context here.</Info>
```

### Tip

```mdx
<Tip>Helpful suggestion here.</Tip>
```

---

## Common Mistakes

### Nested Code Blocks in Templates

**Problem**: Using escaped backticks to show code block syntax renders broken:

```mdx
<!-- DON'T: This shows escaped backticks literally -->

\`\`\`bash
npm install
\`\`\`
```

**Solution**: Use `<CodeGroup>` component instead:

````mdx
<!-- DO: Wrap in CodeGroup for proper rendering -->

<CodeGroup>```bash Install npm install ```</CodeGroup>
````

### Duplicate Headings in Template Examples

**Problem**: Showing multiple template examples with same headings triggers MD024 lint error.

**Solution**: Add lint disable comment at file start:

```mdx
---
title: 'Templates'
---

<!-- markdownlint-disable MD024 -->

## Template 1

### Project structure

...

## Template 2

### Project structure <!-- Same heading, but lint ignored -->

...
```

### Mixed Block/Inline JSX Closing Tag

**Symptom**: Whole page renders as `A parsing error occurred. Please contact the owner of this website.` The title also falls back to the file slug (e.g. "Ch12 multi platform" instead of the frontmatter title), confirming MDX compilation failed for the entire file — not just the block.

**Cause**: Callout components (`<Note>`, `<Warning>`, `<Info>`, `<Tip>`) accept either inline form (tag + content + close on one line) OR block form (tags on own lines). Mixing the two breaks the MDX parser.

```mdx
<!-- DON'T: opening on own line, closing glued to content -->
<Note>
  Don't pick **Full re-initialize** — it overwrites existing config.</Note>

<!-- DON'T: opening glued to content, closing on own line -->
<Note>Don't pick **Full re-initialize** — it overwrites existing config.
</Note>
```

```mdx
<!-- DO: fully inline (short content) -->
<Note>Don't pick **Full re-initialize** — it overwrites existing config.</Note>

<!-- DO: fully block (multi-line or markdown-heavy content) -->
<Note>
  Don't pick **Full re-initialize** — it overwrites existing config.
</Note>
```

**Prevention**: Pick one form per callout and keep both tags consistent. When the body contains backtick code spans, bolded text, or more than one sentence, default to the block form for readability.

### Bulleted List Inside `<Note>` / `<Warning>` / `<Info>` / `<Tip>`

**Symptom**: Same as Mixed Block/Inline above — page renders as `A parsing error occurred`, title falls back to slug.

**Cause**: Prettier reformats Markdown inside JSX block bodies. Bulleted lists indented under the opening tag get pulled to column 0; the closing tag then gets indented 2 spaces. Mintlify sees the bullets as content outside the `<Note>` and the closing tag as misplaced. Parse fails.

```mdx
<!-- Authored as: -->
<Note>
  Hook support varies by platform:

  - **SessionStart** ships on Claude Code, Cursor, OpenCode...
  - **PreToolUse** ships on a smaller subset...
</Note>

<!-- Prettier rewrites to (broken): -->
<Note>
  Hook support varies by platform:

- **SessionStart** ships on Claude Code, Cursor, OpenCode...
- **PreToolUse** ships on a smaller subset...
  </Note>
```

**Prevention**: Don't put bulleted lists inside callouts. Keep the callout to a single inline summary line; place the list outside it.

```mdx
<!-- DO -->
<Note>Hook support varies by platform and by event — see the per-event matrix below.</Note>

- **SessionStart** ships on Claude Code, Cursor, OpenCode...
- **PreToolUse** ships on a smaller subset...
```

If the bullets really must be inside the callout (rare — usually the inline-summary + list-outside form reads better anyway), use raw HTML `<ul><li>` instead of Markdown bullets so Prettier won't reformat them.

**Why this isn't caught by `prettier --check` or `markdownlint-cli2`**: both pass on the broken output. Only `mintlify broken-links` (or rendering the page in a Mintlify dev server) surfaces the parse failure. Worth wiring into CI.

### Table Column Alignment

**Problem**: markdownlint MD060 requires consistent table pipe alignment.

**Solution**: Ensure all columns align:

```markdown
<!-- DON'T: Inconsistent spacing -->

| Command  | What it does                                      |
| -------- | ------------------------------------------------- |
| `/start` | Start session. Loads context, shows current task. |

<!-- DO: Align all pipes -->

| Command  | What it does                                      |
| -------- | ------------------------------------------------- |
| `/start` | Start session. Loads context, shows current task. |
```

---

## Best Practices

### DO

- Always include `title` and `description` in frontmatter
- Use components for visual structure (Cards, Tabs)
- Keep descriptions under 160 characters for SEO
- Use appropriate callout types (Note, Warning, Tip)
- Include code examples with language identifiers
- Use `<CodeGroup>` when showing code block syntax in examples

### DON'T

- Skip frontmatter
- Use raw HTML when components exist
- Write overly long descriptions
- Mix component styles inconsistently
- Leave code blocks without language hints
- Use escaped backticks to show nested code blocks
