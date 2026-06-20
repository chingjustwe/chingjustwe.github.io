---
layout: post
title: "AI Agent Framework Deep Dive: From Feature Comparison to Layered Architecture"
date: 2026-04-11
categories:
  - Tech
tags:
  - DeepAgents
  - OpenCode
  - ADK
  - Claude Agent SDK
  - OpenAI Agents SDK
  - LangGraph
  - Agent
  - LLM
---

> Last updated: 2026-06-20

## 1. Overview

| | Nature | Vendor Lock-in | Typical Use Case |
|---|---|---|---|
| **DeepAgents** | Lightweight library (based on LangGraph) | Model-agnostic | Replicating Claude Code-style deep single-agent workflow |
| **OpenCode** | Terminal product + detachable base | Model-agnostic, multi-provider is a key selling point | Terminal AI coding assistant |
| **Google ADK** | Enterprise full-lifecycle framework | Tight with GCP / Vertex AI (supports third-party models) | Enterprise multi-agent systems needing eval/deploy/observability |
| **Claude Agent SDK** | Library version of Claude Code's core | Tight with Anthropic models | Embedding Claude Code capabilities into your own product/pipeline |
| **OpenAI Agents SDK** | Lightweight multi-agent orchestration library | Nominally model-agnostic, practically OpenAI-optimized | Production-grade multi-agent apps in the OpenAI ecosystem |

One-liner metaphors:
- DeepAgents = "blueprints and parts for building a car"
- OpenCode = "a drivable car (with a chassis you can reuse)"
- ADK = "Google's LangGraph + LangSmith + LangServe all-in-one"
- Claude Agent SDK = "Claude Code's engine exposed as a library"
- OpenAI Agents SDK = "four primitives (Agent/Tool/Handoff/Guardrail) + built-in Tracing in a lightweight production framework"

---

## 2. Core Architecture Layers

These solutions sit at different levels of abstraction:

```text
ADK              → Agent Platform OS
Claude Agent SDK → System-level Runtime (Filesystem/MCP Native)
OpenAI Agents SDK→ Application-level Multi-Agent Runtime
DeepAgents       → Agent Loop / Harness
LangGraph        → Control Flow Engine
```

Bottom to top: farther from applications, stronger system-level capabilities; stronger runtime capabilities; more complete enterprise features.

| Layer | Core Positioning | Problem Solved |
|--------|--------|--------|
| LangGraph | Workflow Engine | How to orchestrate Agent flows |
| DeepAgents | Agent Harness | How to quickly build an Agent Loop |
| OpenAI Agents SDK | Multi-Agent Application Runtime | How to build multi-agent apps |
| Claude Agent SDK | System-level Agent Runtime | How to build agents with filesystem, Shell, and MCP capabilities |
| ADK | Agent Platform Runtime | How to run, manage, and deploy Agent systems |

---

## 3. Layer Responsibilities

### LangGraph — Control Flow Layer

- Graph Execution
- State Machine
- Deterministic Workflow
- Human Defined Routing

> Developers design the execution path; the runtime executes it.

### DeepAgents — Agent Loop Layer

- ReAct Loop
- Tool Calling
- Prompt Driven
- Lightweight

Execution model: LLM → Tool → LLM → Tool → Done

> Engineering the Agent Loop for developers.

### OpenAI Agents SDK — Application Runtime Layer

- Agents / Handoffs / Tools / Guardrails / Tracing

Execution model: Agent A → handoff → Agent B → Tool → Guardrails

> Quickly building production-grade multi-agent applications.

Strengths: Multi-Agent Handoff, Tracing, Guardrails
Weaknesses: Limited runtime capability, not great for coding agents

### Claude Agent SDK — System Runtime Layer

Origin: Claude Code's runtime capabilities made available as a library.

- Filesystem Native / Bash Native / MCP Native
- Subagents / Hooks / Session Persistence

Execution model: Agent ↔ Filesystem ↔ Bash ↔ MCP Tools ↔ Subagents

> An agent is a process that can operate on a real system environment.

Strengths: Naturally suited for coding agents, mature MCP ecosystem, strong filesystem and Shell capabilities

### ADK — Agent Platform Layer

- Runner / Session / Memory / Artifact
- Event Stream / Multi-Agent Orchestration / Deployment

Execution model: Event → Runner → Agents → Tools/Subagents → Memory → Artifacts → Event

> An agent is an observable, deployable, and maintainable system.

Strengths: Complete runtime, native multi-agent support, lifecycle management, enterprise-grade capabilities

---

## 4. DeepAgents vs OpenCode

### 4.1 Core Positioning
- **DeepAgents**: Development framework/library (Python, based on LangGraph) for quickly building agents with deep planning and long-running task execution capabilities (similar to Claude Code). Not an end-user product.
- **OpenCode**: Ready-to-use terminal AI coding assistant (an open-source alternative to Claude Code / Cursor CLI). Its underlying layer can also be extracted and used as a framework.

### 4.2 Subagent Design Philosophy
- **DeepAgents**: Uses a built-in `task` tool to dispatch subtasks to subagents, each with its own context window. The core goal is to prevent main context pollution/bloat, emphasizing context isolation and engineering-style task planning (similar to TODO list state tracking).
- **OpenCode**: Subagents are more role-oriented (e.g., code-reviewer, debugger), each with configurable tool permissions and prompts. The approach resembles "role-based dispatching," with an emphasis on multi-provider support (expensive models for the main agent, cheaper models for subtasks).

### 4.3 Extensibility

| Dimension | DeepAgents | OpenCode |
|---|---|---|
| Extension method | Code-level (Python, custom middleware, tools, state schema) | Config-level + plugin/tool protocol (TS ecosystem, MCP support) |
| Target audience | App developers embedding into their own products | End users + developers who want custom workflows |
| Model support | Any model supported by LangChain | Native multi-provider switching is a selling point |
| UI | No built-in UI, pure backend logic | Built-in TUI (terminal interface), complete experience |

---

## 5. ADK vs DeepAgents

### What ADK has that DeepAgents doesn't

1. **Full lifecycle management**: Built-in evaluation framework, native tracing/observability, one-click deploy to Vertex AI Agent Engine (`adk deploy agent_engine`). DeepAgents doesn't handle testing, deployment, or monitoring at all.
2. **Formal multi-agent type system**: Distinguishes between LLM Agents (LLM-driven decision making), Workflow Agents (Sequential/Parallel/Loop, pure code control flow without LLM), and Custom Agents. DeepAgents ties almost all nodes to the LLM reasoning loop, without "pure code control flow agents" as first-class citizens.
3. **Session / Memory / Artifact three-layer state model + managed services**: Memory persists user info across sessions; Artifact manages files/binaries; backed by managed services (VertexAIMemoryBankService, SQL database support). DeepAgents' "memory" is basically LangGraph's checkpoint/state with no such engineering layering.
4. **Plugin (lifecycle callback) mechanism**: Execute custom code at various stages of the agent workflow via callback hooks (logging, policy enforcement). DeepAgents' middleware mechanism is lighter, lacking this fine-grained multi-stage hook system.
5. **Multi-language SDK**: Python, TypeScript, Go, Java, Kotlin. DeepAgents only has Python (+ a community JS version).
6. **Graph-based workflow runtime (2.0)**: Agents/Tools/Functions evaluated as graph nodes, with native support for auto-retry, telemetry, and Human-in-the-Loop pauses. DeepAgents uses LangGraph under the hood, but HITL and auto-retry need to be wired up manually.

### What DeepAgents has that ADK doesn't (or isn't a core strength)

1. **Minimalist, high-fidelity reproduction of the single-agent mental model**: Focused on replicating Claude Code's "planning + TODO tracking + file tools + subagent isolation" pattern with extremely low cognitive overhead. ADK's conceptual system (Runner/Event/Session/State/Memory/Artifact/Plugin/Callback/WorkflowAgent...) is rich but steep to learn—overkill if all you need is a single deep agent.
2. **Vendor-neutral, lightweight, no cloud dependency**: Built on LangChain/LangGraph, model-agnostic by nature. ADK's high-value features (Memory Bank, Agent Engine deployment, Trace) mostly require Vertex AI, tying the experience to GCP.
3. **Toolkit tailored for coding agent scenarios**: Built-in tools (file read/write, TODO planning, subtask dispatch) are directly tuned for programming tasks. ADK is a general-purpose framework with no "built-in presets" for coding tasks.
4. **Readability and hackability from smaller code footprint**: The codebase is small; middleware, state schema, and subagent dispatch logic have almost no black boxes. ADK has more abstraction layers and a longer debugging chain.

---

## 6. Claude Agent SDK Key Features

1. **Not a general framework, but Claude Code's kernel "as a library"**: Provides exactly the same tools, agent loop, and context management as Claude Code, callable via Python/TypeScript. Unlike DeepAgents' "reimplementation," this is the official engine directly exposed.

2. **Complete subagent context isolation, but only two levels deep**: Subagents get a fresh context, inheriting nothing from the parent conversation. The only communication channel is the prompt string passed to the Agent tool call. The parent receives only the subagent's final message (as-is, possibly summarized). **Limitation**: Subagents cannot spawn their own subagents (no recursive nesting). DeepAgents' graph structure theoretically allows deeper nesting.

3. **Supports different models for subagents**, with two definition methods: filesystem (`.claude/agents/*.md`) and programmatic (`AgentDefinition`). Can share configuration with the Claude Code CLI—a unique design that neither ADK nor OpenAI SDK offers.

4. **Tool Search on-demand loading**: Automatically triggered when MCP tool descriptions exceed 10% of the context window, reducing context usage by up to 95%. None of the other four frameworks specifically address this pain point.

5. **Hooks system down to the tool-call level**: PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd, UserPromptSubmit, etc. Can be bound to specific tools (e.g., auto-log audit trails after Edit/Write).

6. **Notable gaps**: No built-in evaluation framework, no managed deployment, no formal long-term memory/session service—it's essentially a "runtime library." All of these need to be wired up externally.

---

## 7. OpenAI Agents SDK Key Features

1. **Core abstraction is Handoff (control transfer), not task dispatch**: The four primitives are Agent, Tools, Handoffs, Guardrails. Handoff transfers control of the loop—not a function call that returns results. Once handed off, the new agent takes over the entire conversation (also supports "Agents as tools" dispatch-style usage as an option).

2. **Guardrails are first-class citizens, with input/output segmentation and parallel execution**: Failed checks trigger a tripwire, immediately throwing an exception and stopping execution. When chaining multiple agents via handoff, input guardrails only apply to the first agent, and output guardrails only apply to the agent producing the final result.

3. **Tracing dashboard out of the box**: Automatically collects full event records for LLM generations, tool calls, handoffs, guardrails, etc., with debugging via platform.openai.com's Traces panel. On LLM call-chain instant visualization, the experience approaches ADK, but ADK's observability system is more complete (including evaluation framework and deployment telemetry). OpenAI's Tracing being built into a lightweight library is already noteworthy.

4. **Sessions are relatively simple**: Provides automatic conversation history management across agent runs, far less sophisticated than ADK's four-layer system (Session/State/Memory/Artifact).

5. **Nominally provider-agnostic, practically closest to OpenAI**: Supports Responses/Chat Completions API and 100+ other LLMs, but built for the OpenAI API with native support for function calling, structured output, and streaming without additional abstraction layers.

---

## 8. World Model

This is the most fundamental difference between these frameworks—their assumptions about "what world the agent lives in."

| System | World Model |
|--------|--------|
| DeepAgents | Prompt Context |
| OpenAI Agents SDK | Tool + Agent Graph |
| Claude Agent SDK | Filesystem + MCP + Tools |
| ADK | Distributed Runtime System |

---

## 9. Subagent / Task Delegation Mechanisms: Three Design Philosophies

| Mode | Representative | Core Feature | Selling Point |
|---|---|---|---|
| **Dispatch & Report** | DeepAgents' `task` tool<br>Claude Agent SDK's `Agent` (as Tool) | Parent agent stays in control; subagent reports back; parent decides next step | Context isolation |
| **Handoff / Control Transfer** | OpenAI Agents SDK's default Handoff | Control transfers completely; new agent takes over the entire conversation; original agent exits | Clear responsibility boundaries |
| **Graph Node / Workflow Agent** | ADK 2.0 graph-based runtime | Agents/Tools/Functions are all graph nodes; supports LLM-driven transfer + explicit AgentTool delegation; can mix in non-LLM Workflow Agents | Determinism + flexibility (but heaviest conceptually) |

---

## 10. Tool System Comparison

| System | Tool System |
|--------|--------|
| DeepAgents | Function Calling + built-in programming toolset (file read/write, TODO planning, subtask dispatch) |
| OpenAI Agents SDK | Tool Abstraction + Guardrails |
| Claude Agent SDK | MCP + Bash + Filesystem |
| ADK | Tool Registry + Tool Governance + Tool Routing |

---

## 11. State Management

| System | State Model |
|--------|--------|
| DeepAgents | Prompt State |
| OpenAI Agents SDK | Session State |
| Claude Agent SDK | Filesystem + Session |
| ADK | Distributed State + Artifacts |

---

## 12. Engineering Philosophy

| System | Philosophy | Priority |
|--------|------|--------|
| DeepAgents | Make agents easy. | Developer experience first |
| OpenAI Agents SDK | Make multi-agent apps production-ready. | Application development first |
| Claude Agent SDK | Make agents behave like real systems. | System execution capability first |
| ADK | Make agents enterprise-scale systems. | Platform and operations first |

---

## 13. Selection Guide

- **Must be model-agnostic, want to customize every aspect** → DeepAgents
- **Need a terminal-based coding assistant with flexible model switching** → OpenCode (its underlying layer can also be extracted as a framework, though this mode is less mature than DeepAgents' pure library design)
- **Enterprise-grade, need eval/deploy/observability/multi-language team collaboration** → ADK
- **Want to embed Claude Code capabilities into your product, already committed to Anthropic models** → Claude Agent SDK
- **Primarily in the OpenAI ecosystem, need clear handoff patterns + built-in tracing/guardrails** → OpenAI Agents SDK
- **Just need workflow orchestration** → LangGraph

---

## 14. One-Liner Summary

| Solution | One-Liner |
|--------|--------|
| LangGraph | Workflow engine |
| DeepAgents | Agent Harness — lightweight, readable, model-agnostic, great for experimental/custom projects |
| OpenCode | Ready-to-use terminal product with multi-provider support and role-based subagents |
| OpenAI Agents SDK | Multi-Agent Application Runtime — clean primitives, unique Handoff pattern, built-in Guardrails and Tracing |
| Claude Agent SDK | System-level Agent Runtime — most thorough subagent isolation (but only two levels), on-demand tool loading is a unique weapon |
| ADK | Agent Platform OS — enterprise full-lifecycle framework, most complete feature set |

*Note: This article is based on publicly available information as of June 2026. All projects evolve quickly; verify with official documentation before making key decisions.*