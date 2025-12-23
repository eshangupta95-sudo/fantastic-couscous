# Code Parliament MCP - Comprehensive Build Plan

## Overview

An MCP (Model Context Protocol) server that runs 3 AI agents in the background to continuously review, rate, and debate code quality. Integrates with Claude Code to help achieve 95% code satisfaction.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CODE PARLIAMENT                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                     BACKGROUND DAEMON                             │   │
│  │                                                                   │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐     │   │
│  │   │File Watcher │───▶│  Job Queue  │───▶│ Agent Workers   │     │   │
│  │   │  (chokidar) │    │ (debounced) │    │ (3 parallel)    │     │   │
│  │   └─────────────┘    └─────────────┘    └────────┬────────┘     │   │
│  │                                                   │              │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌────────▼────────┐     │   │
│  │   │  Architect  │    │   Critic    │    │   Pragmatist    │     │   │
│  │   │   Agent     │    │   Agent     │    │     Agent       │     │   │
│  │   └──────┬──────┘    └──────┬──────┘    └────────┬────────┘     │   │
│  │          │                  │                    │              │   │
│  │          └──────────────────┼────────────────────┘              │   │
│  │                             ▼                                   │   │
│  │                   ┌─────────────────┐                           │   │
│  │                   │Conflict Resolver│                           │   │
│  │                   │  + Voting       │                           │   │
│  │                   └────────┬────────┘                           │   │
│  │                            ▼                                    │   │
│  │                   ┌─────────────────┐                           │   │
│  │                   │  SQLite Cache   │                           │   │
│  │                   │  (verdicts.db)  │                           │   │
│  │                   └────────┬────────┘                           │   │
│  │                            │                                    │   │
│  └────────────────────────────┼────────────────────────────────────┘   │
│                               │                                         │
│  ┌────────────────────────────▼────────────────────────────────────┐   │
│  │                      MCP SERVER                                  │   │
│  │                                                                  │   │
│  │   Tools:                          Resources:                     │   │
│  │   • parliament_status             • parliament://health          │   │
│  │   • parliament_verdict            • parliament://verdicts/{file} │   │
│  │   • parliament_debate             • parliament://config          │   │
│  │   • parliament_fix                                               │   │
│  │   • parliament_ignore                                            │   │
│  │   • parliament_config                                            │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      WEB DASHBOARD                                │   │
│  │                                                                   │   │
│  │   • Real-time project score                                      │   │
│  │   • Per-file verdicts                                            │   │
│  │   • Agent breakdown                                              │   │
│  │   • Priority queue                                               │   │
│  │   • Settings (base URL, model, thresholds)                       │   │
│  │   • Debate history                                               │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
code-parliament/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
│
├── src/
│   ├── index.ts                 # Main entry - starts daemon + MCP
│   │
│   ├── daemon/
│   │   ├── index.ts             # Daemon orchestrator
│   │   ├── watcher.ts           # File system watcher (chokidar)
│   │   ├── queue.ts             # Job queue with debouncing
│   │   └── analyzer.ts          # Coordinates agent analysis
│   │
│   ├── agents/
│   │   ├── base.ts              # Base agent class
│   │   ├── architect.ts         # Big-picture agent
│   │   ├── critic.ts            # Detail-oriented agent
│   │   ├── pragmatist.ts        # Ship-focused agent
│   │   └── prompts/
│   │       ├── architect.md
│   │       ├── critic.md
│   │       └── pragmatist.md
│   │
│   ├── resolver/
│   │   ├── index.ts             # Conflict resolution
│   │   ├── voting.ts            # Weighted voting system
│   │   └── synthesis.ts         # Combine agent opinions
│   │
│   ├── cache/
│   │   ├── index.ts             # Cache interface
│   │   ├── sqlite.ts            # SQLite implementation
│   │   └── schema.sql           # Database schema
│   │
│   ├── mcp/
│   │   ├── index.ts             # MCP server
│   │   ├── tools.ts             # Tool definitions
│   │   └── resources.ts         # Resource definitions
│   │
│   ├── dashboard/
│   │   ├── server.ts            # Express server
│   │   ├── api.ts               # REST API routes
│   │   └── public/
│   │       ├── index.html       # Dashboard UI
│   │       ├── styles.css
│   │       └── app.js
│   │
│   ├── config/
│   │   ├── index.ts             # Configuration manager
│   │   ├── defaults.ts          # Default settings
│   │   └── schema.ts            # Config validation
│   │
│   └── utils/
│       ├── logger.ts            # Logging utility
│       ├── hash.ts              # File hashing
│       ├── language.ts          # Language detection
│       └── cost.ts              # Cost tracking
│
├── prompts/
│   ├── architect.md
│   ├── critic.md
│   └── pragmatist.md
│
└── test/
    ├── agents.test.ts
    ├── resolver.test.ts
    └── mcp.test.ts
```

---

## Component Specifications

### 1. Configuration System

```typescript
interface ParliamentConfig {
  // API Settings
  api: {
    baseUrl: string;           // Default: https://api.anthropic.com
    apiKey: string;            // From env or config
    model: string;             // Default: claude-sonnet-4-20250514
  };

  // Analysis Settings
  analysis: {
    targetScore: number;       // Default: 95
    maxIterationsPerFile: number;  // Default: 3
    maxIterationsPerSession: number; // Default: 10
    debounceMs: number;        // Default: 2000
    concurrency: number;       // Default: 3
  };

  // Cost Limits
  limits: {
    dailyCostLimit: number;    // Default: 5.00 USD
    maxFileSizeKb: number;     // Default: 100
    maxFilesPerScan: number;   // Default: 50
  };

  // Exclusions
  exclude: {
    patterns: string[];        // Default: node_modules, .git, etc.
    extensions: string[];      // Optional: exclude by extension
  };

  // Agent Weights
  weights: {
    architect: number;         // Default: 1.0
    critic: number;            // Default: 1.2 (security matters more)
    pragmatist: number;        // Default: 0.8
  };

  // Dashboard
  dashboard: {
    enabled: boolean;          // Default: true
    port: number;              // Default: 3377
  };
}
```

### 2. Database Schema

```sql
-- Verdicts table
CREATE TABLE verdicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  architect_score INTEGER,
  architect_reasoning TEXT,
  architect_issues TEXT,  -- JSON array
  critic_score INTEGER,
  critic_reasoning TEXT,
  critic_issues TEXT,     -- JSON array
  pragmatist_score INTEGER,
  pragmatist_reasoning TEXT,
  pragmatist_issues TEXT, -- JSON array
  final_score INTEGER,
  final_verdict TEXT,
  suggestions TEXT,       -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(file_path, file_hash)
);

-- Debates table
CREATE TABLE debates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT,
  topic TEXT,
  transcript TEXT,        -- JSON array of messages
  resolution TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ignores table
CREATE TABLE ignores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT,
  rule TEXT,              -- What to ignore
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cost tracking
CREATE TABLE costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_cost REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Config persistence
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Agent Specifications

#### Architect Agent
- **Focus**: Patterns, architecture, scalability, tech debt
- **Questions it asks**:
  - Is this code modular and maintainable?
  - Are there circular dependencies?
  - Does this follow established patterns?
  - Will this scale?

#### Critic Agent
- **Focus**: Bugs, security, edge cases, performance
- **Questions it asks**:
  - Are there potential runtime errors?
  - Security vulnerabilities?
  - Unhandled edge cases?
  - Performance bottlenecks?

#### Pragmatist Agent
- **Focus**: Simplicity, readability, shipping
- **Questions it asks**:
  - Is this overengineered?
  - Can a junior dev understand it?
  - Does it solve the actual problem?
  - Are we bikeshedding?

### 4. MCP Tools

```typescript
// Get overall project status
parliament_status: () => {
  score: number;           // 0-100
  target: number;          // 95
  approved: boolean;
  filesAnalyzed: number;
  filesAboveTarget: number;
  filesBelowTarget: number;
  priorityFixes: PriorityFix[];
  lastUpdated: string;
}

// Get verdict for specific file
parliament_verdict: (file: string) => {
  file: string;
  scores: { architect, critic, pragmatist };
  finalScore: number;
  issues: Issue[];
  suggestions: Suggestion[];
  debateExcerpt?: string;
}

// Start a live debate on a topic
parliament_debate: (topic: string, files?: string[]) => {
  debateId: string;
  transcript: Message[];
  resolution: string;
  votes: { architect, critic, pragmatist };
}

// Apply a suggested fix
parliament_fix: (file: string, suggestionId: string) => {
  applied: boolean;
  diff: string;
  newScore: number;
}

// Ignore a rule/issue for a file
parliament_ignore: (file: string, rule: string, reason: string) => {
  acknowledged: boolean;
}

// Update configuration
parliament_config: (settings: Partial<Config>) => {
  updated: boolean;
  config: Config;
}
```

### 5. Dashboard API

```
GET  /api/health              - System health
GET  /api/status              - Project score and stats
GET  /api/verdicts            - All file verdicts
GET  /api/verdicts/:file      - Single file verdict
GET  /api/debates             - Debate history
GET  /api/config              - Current config
POST /api/config              - Update config
POST /api/analyze             - Trigger analysis
POST /api/ignore              - Ignore a rule
GET  /api/costs               - Cost tracking
```

---

## Build Phases

### Phase 1: Foundation
- [x] Project setup (package.json, tsconfig)
- [ ] Configuration system
- [ ] SQLite cache layer
- [ ] Logger utility

### Phase 2: Daemon
- [ ] File watcher with debouncing
- [ ] Job queue system
- [ ] Agent base class
- [ ] Three agent implementations
- [ ] Conflict resolver

### Phase 3: MCP Server
- [ ] MCP server setup
- [ ] All tool implementations
- [ ] Resource definitions

### Phase 4: Dashboard
- [ ] Express server
- [ ] REST API
- [ ] Web UI with settings

### Phase 5: Integration
- [ ] Safeguards implementation
- [ ] Cost tracking
- [ ] Claude Code hook setup
- [ ] End-to-end testing

---

## Safeguards Checklist

- [ ] Max iterations per file (3)
- [ ] Max iterations per session (10)
- [ ] Daily cost limit ($5)
- [ ] Confidence threshold (0.7)
- [ ] Stale cache detection (hash mismatch)
- [ ] User override capability
- [ ] File size limits (100KB)
- [ ] Exclusion patterns
- [ ] Deadlock resolution (pragmatist wins)
- [ ] Rollback on test failure

---

## Auto-Notification System (Critical)

### The Problem
Claude won't automatically know when Parliament has new feedback. User shouldn't have to say "check parliament" every time.

### Solution: Hook-Based Alert Injection

```
┌─────────────────────────────────────────────────────────────┐
│                  AUTO-NOTIFICATION FLOW                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Claude writes file ──▶ File saved to disk               │
│                                   │                         │
│  2. Daemon detects change ◀───────┘                         │
│         │                                                   │
│  3. Agents analyze (background)                             │
│         │                                                   │
│  4. Verdict stored in cache                                 │
│         │                                                   │
│  5. Notification written to ~/.parliament/alerts.json       │
│                                                             │
│  ═══════════════════════════════════════════════════════   │
│                                                             │
│  6. Claude Code Hook (PostToolUse for Edit/Write):          │
│         │                                                   │
│         ▼                                                   │
│     ┌─────────────────────────────────────────┐             │
│     │ Check ~/.parliament/alerts.json         │             │
│     │ If new alerts:                          │             │
│     │   → Inject into Claude's context        │             │
│     │   → Claude sees: "⚠️ Parliament Alert"  │             │
│     │   → Claude automatically responds       │             │
│     └─────────────────────────────────────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Options

#### Option A: PostToolUse Hook (Recommended)
```json
// ~/.claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "command": "parliament-notify",
        "timeout": 5000
      }
    ]
  }
}
```

The `parliament-notify` script:
```bash
#!/bin/bash
# Checks for pending Parliament alerts and outputs them
# Claude sees this output as part of tool result

ALERTS=$(cat ~/.parliament/alerts.json 2>/dev/null)
if [ -n "$ALERTS" ] && [ "$ALERTS" != "[]" ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🏛️ PARLIAMENT ALERT"
  echo "$ALERTS" | jq -r '.[] | "• \(.file): \(.score)% - \(.topIssue)"'
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  # Clear alerts after showing
  echo "[]" > ~/.parliament/alerts.json
fi
```

#### Option B: MCP Notification Resource
```typescript
// MCP resource that Claude auto-subscribes to
server.resource("parliament://notifications", {
  subscribe: true,
  handler: async () => {
    const alerts = await cache.getPendingAlerts();
    return {
      hasAlerts: alerts.length > 0,
      alerts: alerts,
      projectScore: await cache.getProjectScore()
    };
  }
});
```

#### Option C: Inline Tool Enhancement
Every MCP tool response includes Parliament status:
```typescript
// Every tool response includes this footer
{
  ...toolResult,
  _parliament: {
    score: 78,
    newAlerts: [
      { file: "auth.ts", score: 65, issue: "Race condition" }
    ]
  }
}
```

### Chosen Approach: Hybrid

1. **PostToolUse Hook** - Immediate alerts after file changes
2. **MCP Notifications Resource** - Claude can subscribe for updates
3. **parliament_status tool** - Always available for manual check

### Alert File Format

```json
// ~/.parliament/alerts.json
[
  {
    "id": "abc123",
    "timestamp": "2024-01-15T10:30:00Z",
    "file": "src/auth.ts",
    "score": 65,
    "previousScore": null,
    "topIssue": "Potential race condition in token refresh",
    "severity": "high",
    "suggestion": "Add mutex lock around refresh logic"
  }
]
```

### Claude's Expected Behavior

When Claude sees a Parliament Alert, it should:
1. Acknowledge the alert
2. Read the file if needed
3. Apply the suggested fix
4. Wait for re-analysis
5. Repeat until 95% or max iterations reached

This is achieved via MCP tool description that instructs Claude:
```typescript
server.tool("parliament_status", {
  description: `Check Parliament approval status.

  IMPORTANT: After writing or modifying code files, you will receive
  Parliament alerts via hook. When you see these alerts:
  1. Review the priority fixes
  2. Apply fixes to lowest-scoring files first
  3. Re-check status after fixes
  4. Repeat until score >= 95% or user says stop

  Always inform user of current Parliament score.`,
  handler: async () => { ... }
});
```

---

## Success Criteria

1. Daemon runs in background without blocking Claude
2. Agents analyze files and produce scores 0-100
3. Conflicts are resolved via weighted voting
4. MCP tools return cached results instantly (<50ms)
5. Dashboard shows real-time project health
6. User can change base URL and model via dashboard
7. 95% target is achievable without infinite loops
8. Cost stays under $5/day for typical usage
9. **Claude automatically receives alerts after file changes**
10. **Claude acts on alerts without user prompting**
