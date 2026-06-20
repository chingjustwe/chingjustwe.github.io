---
layout: post
title: "Agent Framework / Runtime 全景对比"
date: 2026-06-20
categories:
  - Tech
tags:
  - LangGraph
  - DeepAgents
  - OpenAI Agents SDK
  - Claude Agent SDK
  - ADK
  - Agent
  - LLM
---

## 核心分层

```text
ADK              → Agent Platform OS
Claude Agent SDK → System-level Runtime（Filesystem/MCP Native）
OpenAI Agents SDK→ Application-level Multi-Agent Runtime
DeepAgents       → Agent Loop / Harness
LangGraph        → Control Flow Engine
```

---

## 一、定位对比

| 方案 | 核心定位 | 解决的问题 |
|--------|--------|--------|
| LangGraph | Workflow Engine | 如何编排 Agent 流程 |
| DeepAgents | Agent Harness | 如何快速构建 Agent Loop |
| OpenAI Agents SDK | Multi-Agent Application Runtime | 如何构建多 Agent 应用 |
| Claude Agent SDK | System-level Agent Runtime | 如何构建具备文件系统、Shell、MCP能力的 Agent |
| ADK | Agent Platform Runtime | 如何运行、管理和部署 Agent 系统 |

---

## 二、各层职责

### LangGraph

定位：Control Flow Layer

特点：

- Graph Execution
- State Machine
- Deterministic Workflow
- Human Defined Routing

核心思想：

> 开发者设计执行路径，运行时负责执行。

---

### DeepAgents

定位：Agent Loop Layer

特点：

- ReAct Loop
- Tool Calling
- Prompt Driven
- Lightweight

执行模型：

```text
LLM
 ↓
Tool
 ↓
LLM
 ↓
Tool
 ↓
Done
```

核心思想：

> 帮开发者把 Agent Loop 工程化。

---

### OpenAI Agents SDK

定位：Application Runtime Layer

特点：

- Agents
- Handoffs
- Tools
- Guardrails
- Tracing

执行模型：

```text
Agent A
 ↓ handoff
Agent B
 ↓
Tool
 ↓
Guardrails
```

核心思想：

> 快速构建生产级 Multi-Agent 应用。

优势：

- Multi-Agent Handoff
- Tracing
- Guardrails

不足：

- Runtime能力有限
- 不擅长 Coding Agent 场景

---

### Claude Agent SDK

定位：System Runtime Layer

来源：

Claude Code Runtime能力开放。

特点：

- Filesystem Native
- Bash Native
- MCP Native
- Subagents
- Hooks
- Session Persistence

执行模型：

```text
Agent
 ↕
Filesystem
 ↕
Bash
 ↕
MCP Tools
 ↕
Subagents
```

核心思想：

> Agent 是一个可操作真实系统环境的进程。

优势：

- Coding Agent天然适配
- MCP生态成熟
- 文件系统能力强
- Shell执行能力强

---

### ADK

定位：Agent Platform Layer

特点：

- Runner
- Session
- Memory
- Artifact
- Event Stream
- Multi-Agent Orchestration
- Deployment

执行模型：

```text
Event
 ↓
Runner
 ↓
Agents
 ↓
Tools/Subagents
 ↓
Memory
 ↓
Artifacts
 ↓
Event
```

核心思想：

> Agent 是一个可观测、可部署、可运维的系统。

优势：

- Runtime完整
- 多Agent原生支持
- 生命周期管理
- 企业级能力

---

## 三、世界模型（World Model）

这是几个框架最本质的区别。

| 系统 | World Model |
|--------|--------|
| DeepAgents | Prompt Context |
| OpenAI Agents SDK | Tool + Agent Graph |
| Claude Agent SDK | Filesystem + MCP + Tools |
| ADK | Distributed Runtime System |

---

## 四、多 Agent 能力

| 系统 | Multi-Agent |
|--------|--------|
| DeepAgents | 需自行实现 |
| OpenAI Agents SDK | Handoffs |
| Claude Agent SDK | Subagents |
| ADK | Native Orchestration |

---

## 五、Tool System 对比

### DeepAgents

- Function Calling
- 内置编程工具集（文件读写、TODO 规划、子任务派发）

### OpenAI Agents SDK

- Tool Abstraction
- Guardrails

### Claude Agent SDK

- MCP
- Bash
- Filesystem

### ADK

- Tool Registry
- Tool Governance
- Tool Routing

---

## 六、State 管理

| 系统 | State模型 |
|--------|--------|
| DeepAgents | Prompt State |
| OpenAI Agents SDK | Session State |
| Claude Agent SDK | Filesystem + Session |
| ADK | Distributed State + Artifacts |

---

## 七、工程哲学

### DeepAgents

> Make agents easy.

开发体验优先。

---

### OpenAI Agents SDK

> Make multi-agent apps production-ready.

应用开发优先。

---

### Claude Agent SDK

> Make agents behave like real systems.

系统执行能力优先。

---

### ADK

> Make agents enterprise-scale systems.

平台与运维能力优先。

---

## 八、总体关系图

```text
ADK
 ↑
Claude Agent SDK
 ↑
OpenAI Agents SDK
 ↑
DeepAgents
 ↑
LangGraph
```

从下到上：

- 离应用程序越来越远，系统级能力越来越强
- Runtime能力越来越强
- 企业级能力越来越完整

---

## 九、选型建议

### 想做 Workflow

推荐：

- LangGraph

---

### 想快速做 Agent 应用

推荐：

- DeepAgents
- OpenAI Agents SDK

---

### 想做 Coding Agent

推荐：

- Claude Agent SDK

典型场景：

- OpenCode
- Claude Code
- Cursor类产品（Claude 模型集成模式可参考其设计）

---

### 想做 Agent SaaS 平台

推荐：

- ADK

典型场景：

- Multi-Agent Platform
- Enterprise Agent System
- Long-running Agent Runtime

---

> **注**：本文未单独对比 OpenCode。OpenCode 是终端产品，其底层 Agent Loop 可对应 DeepAgents 层，MCP 集成能力可对应 Claude Agent SDK 层，但不作为一个独立的运行时方案单独对比。

---

## 十、一句话总结

### LangGraph

流程引擎。

### DeepAgents

Agent Harness。

### OpenAI Agents SDK

Multi-Agent Application Runtime。

### Claude Agent SDK

System-level Agent Runtime。

### ADK

Agent Platform OS。