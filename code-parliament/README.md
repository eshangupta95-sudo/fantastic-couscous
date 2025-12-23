# Code Parliament

An MCP server that analyzes your code and provides quality verdicts. When issues are found, Claude automatically fixes them - zero friction!

## Quick Start

### Option 1: MCP Tool (Claude calls when needed)

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "code-parliament": {
      "command": "npx",
      "args": ["-y", "code-parliament"]
    }
  }
}
```

Then in Claude Code, you can ask:
- "Analyze this file with Parliament"
- "Check the code quality of src/app.ts"
- "Get Parliament verdict for all my changes"

Claude will use the `parliament_analyze` tool to check your code.

### Option 2: Auto-Fix Mode (Fully Automatic)

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "command": "npx -y code-parliament-autofix",
        "timeout": 10000
      }
    ]
  }
}
```

Now whenever Claude writes code:
1. Parliament automatically analyzes the file
2. If issues found, Claude immediately fixes them
3. No interaction needed - it just works!

## How It Works

### MCP Tools Available

| Tool | Description |
|------|-------------|
| `parliament_analyze` | Analyze a file and get verdict with issues |
| `parliament_status` | Get status of all analyzed files |
| `parliament_get_verdict` | Get cached verdict for a specific file |

### What Gets Checked

- **Critical**: Empty catch blocks, hardcoded secrets
- **High**: console.log statements, `any` types
- **Medium**: TODO/FIXME comments, long lines

### Example Response

```
## Code Parliament Verdict for src/utils/api.ts

**Score: 78/100** ⚠️

**Summary:** Code is acceptable but has some issues to address.

### Issues Found (3)

1. 🔴 **CRITICAL** (line 45)
   Empty catch block swallows errors silently
   💡 *Suggestion:* Add error logging: console.error('Error:', error);

2. 🟠 **HIGH** (line 23)
   Debug console.log should not be in production code
   💡 *Suggestion:* Remove this console.log statement

3. 🟠 **HIGH** (line 67)
   "any" type on "response" removes type safety
   💡 *Suggestion:* Replace "any" with the appropriate type
```

## Development

```bash
# Install dependencies
npm install

# Build MVP (simple MCP + autofix)
npm run build

# Run in development mode
npm run dev

# Build full version (with server, dashboard, etc)
npm run build:full
```

## Architecture

```
┌─────────────────┐     ┌───────────────────┐
│   Claude Code   │────▶│  MCP Server       │
│                 │     │  (parliament)     │
│   Writes file   │     │                   │
└─────────────────┘     │  Analyzes code    │
         │              │  Returns verdict  │
         │              └───────────────────┘
         ▼
┌─────────────────┐
│   Auto-Fix Hook │
│                 │
│  Reads file     │
│  Finds issues   │
│  Tells Claude   │
│  to fix them    │
└─────────────────┘
         │
         ▼
    Claude fixes
    automatically!
```

## License

MIT
