---
layout: post
title: "The Divide and Convergence of Agents: Coding Agent vs Personal Agent — A Panoramic Comparison"
date: 2026-04-10
categories:
  - Tech
tags:
  - Agent
  - LLM
  - Architecture
  - OpenCode
  - OpenClaw
---

## Preface

Many people think of OpenClaw and Hermes as "Claude Code + Telegram" or "OpenCode + Slack." That's one way to look at it, but not quite accurate.

A better way to think about it:

> Claude Code / OpenCode answers "how to complete a task";
> OpenClaw / Hermes answers "how to keep an Agent running as a persistent system."

---

## 1. Layered Positioning Model

The entire Agent tech stack can be divided into four layers, bottom to top:

| Layer | Representatives | Core Responsibility |
|-------|----------------|-------------------|
| LLM | Claude, GPT, Gemini | Basic reasoning and generation |
| Agent | Claude Code, OpenCode, Codex | Task-oriented execution unit |
| Agent Runtime | Hermes, OpenClaw | State management, Session persistence, Memory, Tool orchestration |
| Agent Platform / Gateway | Hermes, OpenClaw | User management, Multi-channel access, MCP management, Scheduled tasks |

Both Hermes and OpenClaw span the Runtime and Platform layers simultaneously — they just emphasize different aspects:
- **Hermes leans Runtime**: focused on how Agents grow — Reflection, Skill Extraction, Long-term Memory, Self Improvement
- **OpenClaw leans Platform**: focused on how Agents connect to the outside world — Gateway, Scheduler, Multi-model routing, Multi-channel access

They are complementary, not hierarchical.

---

## 2. Core Dimensional Comparison

| Dimension | Claude Code / Opencode / Codex | OpenClaw / Hermes |
|:---|:---|:---|
| **Execution Model** | Passive trigger (single session), CLI or IDE plugin | Active runtime (persistent daemon), background process |
| **Lifecycle** | Command start → read code → run tools → task ends, process exits | 24/7 online, no manual intervention required |
| **Core Identity** | **High-performance temp contractor** for development | **Digital employee / Virtual OS** spanning work and life |
| **Skill Focus** | Vertical depth: large codebases, dependency graphs, bug fixing | Broad generalist: personal context (calendar, email, credentials) |
| **Tool Ecosystem** | Compilers, Linters, Git, terminal commands | MCP protocol, Web browser, Slack, Gmail, Notion |
| **Interaction Medium** | Limited to Terminal or IDE | Anywhere (Telegram, WhatsApp, Discord, voice) |

---

## 3. The Real Difference: Runtime Ownership

The table above shows symptoms. The deeper difference is **Runtime Ownership**.

### OpenCode / Claude Code

```
Core goal: Complete a task
Lifecycle: Task Scoped (exit when done)
```

### OpenClaw / Hermes

```
Core goal: Keep existing
Lifecycle: Process Scoped, even User Scoped
```

A Docker vs Kubernetes analogy helps illustrate this:

| | Docker | Kubernetes | OpenCode | OpenClaw |
|---|---|---|---|---|
| Focus | Run a container | Keep containers alive forever | Run Agent | Keep Agent Alive |
| Lifecycle | One-shot | Long-running | Task Scoped | Process Scoped |

Docker cares about "how to run a container"; K8s cares about "how to keep containers alive forever" — the same relationship holds between OpenCode and OpenClaw.

---

## 4. Why the Lines Are Blurring

Back in 2024, the two types of Agents were clearly separated:

```
Claude Code = Coding Agent
OpenClaw    = Personal Agent
```

But things have changed. MCP, Memory, Sub Agent, Tool Calling, Session Resume, Workflow — these capabilities now ship in Claude Code, OpenCode, Codex, and others. Coding Agents and General Agents are gradually converging.

This means you can't understand the difference just by looking at a static feature checklist. You also need to look at their evolution: Coding Agents are growing upward (adding MCP, Memory, Workflow), while Personal Agents also need low-level code execution. Eventually they'll meet at the Agent Runtime layer.

---

## 5. Architecture Upgrade: From Coding Agent to Persistent Agent

If you plan to wrap a persistent Daemon, IM Gateway, and scheduled task system around Opencode (or Claude Code), you can absolutely assemble an "OpenClaw Lite." But there are four core challenges to solve:

### 5.1 State Persistence and Context Explosion

Opencode is stateless by nature — it runs and then disappears. A persistent Agent must maintain long-term session state. Blindly piling up history blows up the LLM context window and sends token costs through the roof.

**Solution**: Introduce a vector-database-based long-term memory retrieval system (RAG) with memory condensation. Dynamically distill historical logs and only feed the most relevant context to the model.

### 5.2 Async Long-Running Tasks and Human-in-the-Loop

When a scheduled task triggers an Agent to modify code or config, if it hits a dangerous operation (like `rm -rf` or `terraform apply`), CLI mode can just block waiting for terminal input. But if a background daemon thread blocks, the entire service goes down.

**Solution**: Design a Suspend/Resume state machine. When a high-risk action is triggered, intercept the execution flow, set state to `PENDING_APPROVAL`, and push a message with action buttons through the IM gateway. The thread waits gracefully until the user taps "Allow," then resumes execution.

### 5.3 Concurrency Conflicts and Distributed Locks

Once you introduce scheduled tasks alongside random IM triggers, conflicts can happen. Example: at 2:00 AM, a monitoring script detects an anomaly and triggers Agent A to modify a config file. At the same time, the user sends a command from their phone triggering Agent B to refactor the same logic.

**Solution**: Implement file locks or a distributed lock queue (e.g., Redis Redlock) to ensure operations on the same repository are serialized and safe.

### 5.4 Dynamic Peripheral Extension and Tool Decoupling

Opencode's Tool Calls are typically hardcoded in its source. If you want a scheduled task to read Google Calendar or sync data to Notion, you end up frequently modifying core code.

**Solution**: Fully embrace the MCP protocol. Make the Daemon process an MCP client, wrap third-party services as independent MCP servers, and let the model discover and invoke tools through a standard protocol.

---

## 6. The Real Pain: Production-Grade Runtime

What works in a demo and what survives in production are two different things. Scenarios that a "Lego-block" mindset tends to overlook:

```
A task runs for 8 hours. During that time:
- Network disconnects
- Process restarts
- Session is lost
- Agent crashes

The system still needs to recover and continue.
```

This requires:

- State Persistence
- Checkpoint
- Workflow Recovery
- Event Sourcing
- Queue Management

Listing the components you need (Gateway, Scheduler, Memory) is just step one. The real challenge is making them collaborate and tolerate failures in a production environment. It's fine if a personal project crashes occasionally. But if you're running it as a production-grade service, this part is the real heavyweight.

---

## 7. Recommended Engineering Stack

A battle-tested combination:

```
+-------------------------------------------------------+
|                    User (IM Client)                    |
|             (Telegram / WhatsApp / Slack)             |
+---------------------------+---------------------------+
                            | Webhook / Long connection
                            v
+-------------------------------------------------------+
|             API Gateway & Routing (FastAPI)            |
+---------------------------+---------------------------+
                            | Async dispatch
                            v
+-------------------------------------------------------+
|         Task Scheduling & Queue (Celery + Redis)       |
|    - Scheduled tasks (APScheduler) - Lock (Redlock)    |
+---------------------------+---------------------------+
                            | MCP Protocol / API
                            v
+-------------------------------------------------------+
|            Core Execution Node (Opencode)              |
|         Code analysis, modification, build, test       |
+-------------------------------------------------------+
```

Key technology choices:

1. **Foundation**: Keep Opencode / Claude Code as the Execution Node — let it handle the code-level dirty work
2. **Scheduling**: Python FastAPI for the Daemon process, APScheduler for scheduled tasks, Celery + Redis for long-running async queues
3. **Connection**: Mature Python IM bot frameworks (e.g., `python-telegram-bot`), wrapping user input into standardized Prompts and dispatching them to queues
4. **Communication**: Standard REST API or MCP protocol between Daemon and execution node — avoid directly shelling out from Python

There's nothing novel about this stack. If you break it down, OpenClaw is essentially: Gateway + Memory + Scheduler + Tool Registry + Agent Runtime. Every piece has mature off-the-shelf solutions. Spring Boot + Quartz + PostgreSQL + Redis + OpenCode gets you most of the way there.

---

## Summary

| Dimension | Claude Code / OpenCode / Codex | OpenClaw / Hermes |
|:---|:---|:---|
| **Core Question** | How to complete a task? | How to keep an Agent alive? |
| **Essence** | Task-Oriented Agent | Agent Operating System |
| **Lifecycle** | Task Scoped | Process / User Scoped |
| **Analogy** | Docker | Kubernetes |
| **Blind Spot** | No cross-Session state persistence | No deep code-level execution ability |

The differences between the two are real today, but the trend is convergence. If you add Gateway, Scheduler, Memory, User Management, Persistence, and Recovery Mechanism on top of OpenCode, you're already building a Mini OpenClaw.

When you're sitting at a keyboard focused on development, use Claude Code / Cursor. When you need a 24/7 digital proxy to monitor and handle workflows, use OpenClaw.
