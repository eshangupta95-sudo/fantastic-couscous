# Code Parliament

An MCP (Model Context Protocol) server that runs 3 AI agents in the background to continuously review, rate, and debate your code quality. Integrates with Claude Code to help achieve 95% code satisfaction.

## Quick Start (1 Step!)

Add this to your Claude Code settings (`~/.claude/settings.json`):

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

Restart Claude Code. Done! Parliament is now reviewing your code.

> **Note**: Uses your existing `ANTHROPIC_API_KEY` environment variable.

## Features

- **3 AI Agents** with distinct perspectives:
  - **The Architect** - Focuses on patterns, scalability, and architecture
  - **The Critic** - Finds bugs, security issues, and edge cases
  - **The Pragmatist** - Advocates for simplicity and shipping

- **Background Analysis** - Daemon watches files and analyzes in the background
- **Real-time Dashboard** - Web UI to view scores, settings, and configure the system
- **MCP Integration** - Tools for Claude to check status, get verdicts, and more
- **Auto-notifications** - Alerts Claude when code needs attention
- **Weighted Voting** - Configurable agent weights for conflict resolution
- **Cost Tracking** - Daily cost limits and usage tracking

## Installation

```bash
cd code-parliament
npm install
npm run build
```

## Quick Start

### 1. Set your API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Run the daemon

```bash
# Watch current directory
npm start

# Or watch a specific project
npm start /path/to/your/project
```

### 3. Open the dashboard

Visit http://localhost:3377 to see the dashboard.

### 4. Configure Claude Code

Add to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "code-parliament": {
      "command": "node",
      "args": ["/path/to/code-parliament/dist/index.js", "${workspaceFolder}"]
    }
  }
}
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `parliament_status` | Get overall project health and priority fixes |
| `parliament_verdict` | Get detailed verdict for a specific file |
| `parliament_debate` | View agent debate transcript |
| `parliament_ignore` | Ignore a specific rule for a file |
| `parliament_config` | View or update configuration |
| `parliament_alerts` | Get and clear pending alerts |

## Dashboard Settings

The dashboard at http://localhost:3377 allows you to:

- **View project score** and individual file verdicts
- **Change API Base URL** - Point to a different API endpoint
- **Change Model** - Select which Claude model to use
- **Set Target Score** - Configure the 95% threshold
- **Adjust Agent Weights** - Give more influence to certain agents
- **View Cost Tracking** - Monitor daily API costs

## Configuration

Configuration is stored in `~/.parliament/config.json` or `<project>/.parliament/config.json`.

```json
{
  "api": {
    "baseUrl": "https://api.anthropic.com",
    "model": "claude-sonnet-4-20250514"
  },
  "analysis": {
    "targetScore": 95,
    "maxIterationsPerFile": 3,
    "debounceMs": 2000
  },
  "weights": {
    "architect": 1.0,
    "critic": 1.2,
    "pragmatist": 0.8
  },
  "limits": {
    "dailyCostLimit": 5.0,
    "maxFileSizeKb": 100
  }
}
```

## Auto-Notification Setup

To have Claude automatically receive Parliament alerts, add this hook to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "command": "node /path/to/code-parliament/dist/notify.js",
        "timeout": 5000
      }
    ]
  }
}
```

## How It Works

1. **File Watcher** - Monitors your project for changes
2. **Job Queue** - Debounces and queues analysis jobs
3. **Parallel Analysis** - All 3 agents analyze files simultaneously
4. **Conflict Resolution** - Weighted voting resolves disagreements
5. **Cache Layer** - SQLite stores verdicts for instant retrieval
6. **MCP Server** - Claude Code queries cached verdicts (instant)
7. **Alerts** - Low-scoring files trigger alerts for Claude

## Agent Personalities

### The Architect
- Questions: Is this modular? Will it scale? Does it create tech debt?
- Scores high for: Clean patterns, separation of concerns
- Scores low for: Tight coupling, circular dependencies

### The Critic
- Questions: Are there bugs? Security issues? Edge cases?
- Scores high for: Robust error handling, secure code
- Scores low for: Race conditions, injection vulnerabilities

### The Pragmatist
- Questions: Is this overengineered? Can a junior understand it?
- Scores high for: Simple, readable, maintainable code
- Scores low for: Unnecessary abstractions, clever tricks

## Safeguards

- **Max iterations per file** - Prevents infinite loops (default: 3)
- **Daily cost limit** - Stops analysis when limit reached (default: $5)
- **Confidence threshold** - Ignores low-confidence verdicts
- **User override** - Ignore specific rules with `parliament_ignore`
- **Deadlock resolution** - Pragmatist wins ties by default

## API Reference

### REST Endpoints

```
GET  /api/health        - System health
GET  /api/status        - Project score and stats
GET  /api/verdicts      - All file verdicts
GET  /api/verdicts/:file - Single file verdict
GET  /api/config        - Current configuration
POST /api/config        - Update configuration
POST /api/analyze       - Trigger analysis for a file
GET  /api/costs         - Cost tracking data
```

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## License

MIT
