---
layout: post
title: "LangChain / LangGraph / DeepAgents / OpenCode：四款 Agent 框架对比与 DeepAgents 架构解析"
date: 2026-01-08
categories:
  - Tech
tags:
  - LangChain
  - LangGraph
  - DeepAgents
  - OpenCode
  - Agent
  - LLM
---

最近把市面上几个主流的 Agent 框架都过了一遍。LangChain、LangGraph、DeepAgents、OpenCode 这四个名字各有定位，放一起很容易搞混。这篇文章先给你一个整体对比，再深入拆解 DeepAgents 的架构细节。

## 一、总体定位

| 项目 | 类型 | 核心定位 |
|------|------|----------|
| LangChain | Framework | LLM 应用开发框架 |
| LangGraph | Runtime | Agent 编排与执行运行时 |
| DeepAgents | Harness | 预置 Agent 操作系统级执行环境 |
| OpenCode | Runtime (System-level) | 面向 Coding Agent 的执行沙箱与工具运行时 |

## 二、核心差异一览

| 维度 | LangChain | LangGraph | DeepAgents | OpenCode |
|------|----------|------------|-------------|-----------|
| 抽象层级 | 低层工具封装 | 状态机/图编排 | Agent OS（高层封装） | 系统级执行环境 |
| 使用方式 | 手写 chain/agent | 定义 graph | 直接使用 agent preset | 直接运行 agent |
| 控制方式 | 开发者完全控制 | 开发者定义流程 | 约束 + 自动调度 | runtime 自动执行 |
| 复杂度 | 中 | 高 | 低 | 中 |
| 可定制性 | 极高 | 极高 | 中 | 中 |
| 面向用户 | 开发者 | Agent 架构设计者 | Agent 使用者 | Coding Agent 用户 |

## 三、设计理念差异

### 1. LangChain（Framework）

- 提供基础抽象（LLM / Tool / Memory）
- 不关心执行结构
- 一切由开发者组合

本质：工具箱

### 2. LangGraph（Runtime）

- 用"图"定义 agent 执行流程
- 支持循环 / 分支 / 状态管理
- 适合复杂 workflow

本质：可编程执行图

### 3. DeepAgents（Harness）

把 Agent 变成"操作系统级运行环境"。提供：

- 任务拆解（task / todo system）
- 子 agent（subprocess model）
- 文件系统 memory（external state）
- 自动上下文管理
- 权限与安全控制
- long-running 执行机制

本质：Agent OS

### 4. OpenCode（Runtime）

让 Agent 能安全操作真实计算环境。提供：

- shell 执行
- git / repo 操作
- 文件系统访问
- sandbox 隔离
- MCP / tool runtime
- 长任务执行能力

本质：Coding Agent 操作系统

## 四、执行模型对比

### LangChain
```
LLM -> Tool -> LLM -> Tool
```

严格来说，LangChain 的 `create_agent` 底层也是这个循环模式，但开发者不直接控制循环逻辑。LCEL 链是线性组合，ReAct 循环藏在 agent 内部。

### LangGraph
```
Node A -> Node B -> Node C
   ^         |
   +---------+
```

LangGraph 把循环、分支、状态转移都暴露为可编程节点。你想让模型在什么条件下重试、走哪条分支、怎么合并结果，都可以在图上精确控制。

### DeepAgents
```
Agent
 +-- Planner (todo system)
 +-- SubAgent (isolated workers)
 +-- File System (external memory)
 +-- Tool Runtime
 +-- Context Manager
```

Agent OS 的视角：一个 Agent 内部有规划器、子 Agent、文件系统、工具运行时、上下文管理器。它们各司其职，构成一个完整的执行环境。

### OpenCode
```
Agent
 +-- Sandbox Runtime
 +-- File System
 +-- Shell / Git
 +-- MCP Tools
 +-- Permission Layer
```

更偏系统层：把计算环境包装成安全的沙箱，让 Agent 能执行 shell 命令、操作文件、管理 repo，同时受权限层控制。

## 五、DeepAgents 架构深入

上面是从外部看四个项目的对比。下面我们深入 DeepAgents 内部，看看一个 `create_deep_agent` 调用到底做了什么。

### create_deep_agent 内部发生了什么

你写 `agent = create_deep_agent(model=..., tools=[...])` 时，它实际上做了一整套 LangGraph 图装配。下面是我根据源码梳理的内部构造：

```
+---------------------------------------------------------------+
|  create_deep_agent (deepagents)                                |
|                                                                |
|  1. 解析 model / tools / subagents / permissions ...           |
|  2. 组装 middleware 栈（大致顺序，具体版本可能有出入）:         |
|      +- TodoListMiddleware        (write_todos / read_todos)    |
|      +- SkillsMiddleware          (可选，技能文件)             |
|      +- FilesystemMiddleware      (ls/read/write/edit/glob/grep)|
|      +- SubAgentMiddleware        (task 工具 -> 子代理)        |
|      +- SummarizationMiddleware   (上下文压缩)                  |
|      +- PatchToolCallsMiddleware  (工具调用修正)               |
|      +- User Middleware           (你传入的 middleware)         |
|      +- MemoryMiddleware          (可选，AGENTS.md)             |
|      +- HumanInTheLoopMiddleware  (可选，interrupt_on)          |
|                                                                |
|  3. 调用 create_agent(...) -> 构建 LangGraph StateGraph         |
+----------------------------+----------------------------------+
                             |
                             v
+---------------------------------------------------------------+
|  create_agent (langchain.agents)                               |
|                                                                |
|  graph = StateGraph(AgentState)                                |
|                                                                |
|  Nodes:                                                        |
|    model  -- LLM 调用节点（你传的 ChatOpenAI / ChatAnthropic）  |
|    tools  -- ToolNode（执行所有工具调用）                       |
|    *.before_model / *.after_model  -- middleware 钩子          |
|    *.before_tools / *.after_tools  -- middleware 钩子          |
|                                                                |
|  Edges（就是 ReAct 循环）:                                      |
|    START ----------------------> entry_node                    |
|    model -> tools  (有 tool_calls 时)                          |
|    model -> exit   (无 tool_calls 时)                          |
|    tools -> model  (循环回 LLM)                                 |
|    model -> *.after_model  (middleware 处理)                  |
|    loop_exit_node -> exit_node                                 |
|                                                                |
|  return graph.compile() -> CompiledStateGraph                  |
+---------------------------------------------------------------+
```

### 核心要点

| 你看到的部分 | 隐藏的部分 |
|---|---|
| `create_deep_agent(model=..., tools=[...])` | 内部构造了完整的 LangGraph StateGraph |
| `agent.invoke({"messages": [...]})` | 在图里反复循环：model -> tools -> model -> tools -> ... |
| 只传了 2 个自定义工具 | 框架自动注入 write_todos / ls / read_file / write_file / execute / task（总共约 10+ 工具） |
| `tools=[get_current_time, search_files]` | 这些被合并到同一个 ToolNode 中，和内置工具无区别 |
| 看起来是一次性调用 | 实际内部可能跑了多轮（LLM -> 调工具 -> 结果喂回 LLM -> 再调工具 -> ...） |

### Harness 到底指什么

Harness 不是某个类，而是整套基础设施的统称：

- **Graph 结构**: StateGraph + nodes + edges（状态传递、循环控制）
- **Middleware 栈**: 每个 middleware 在模型调用和工具执行前后注入行为（文件系统、摘要、记忆等）
- **内置工具**: planning / filesystem / execution / task delegation
- **Profile 系统**: 根据模型自动选择优化的 system prompt 和 tool description（例如 Claude 有特定 profile）
- **Subagent 管理**: context isolation、工具继承、状态隔离

你可以通过 `HarnessProfile` 定制这套行为，但默认值已经开箱即用。

### 怎么验证

```python
agent = create_deep_agent(model=model, tools=[...])

print(type(agent))
# <class 'langgraph.graph.state.CompiledStateGraph'>

print(agent.get_graph().draw_ascii())

# 查看已注册的工具列表
print([t.name for t in agent.tools])

agent.invoke({"messages": [...]}, debug=True)
```

我实际跑下来，`get_graph().draw_ascii()` 的输出能直观看到整个图的结构，调试时很有帮助。

## 六、关系总结

它们不是替代关系，是层级关系：

```
LangChain (基础能力)
   |
LangGraph (编排层)
   |
DeepAgents (Agent OS 封装层)
   |
OpenCode (系统级执行 Runtime)
```

LangChain 提供积木，LangGraph 帮你设计拼法，DeepAgents 直接给你一个能干活的操作系统，OpenCode 再给这个操作系统配一个安全的机房。

## 七、怎么选

### 综合场景速查

| 使用场景 | 推荐方案 |
|----------|----------|
| 简单的链式调用 | LangChain LCEL |
| 自定义图编排、状态机 | LangGraph |
| 开箱即用的复杂 Agent | DeepAgents |
| 纯粹需要 Agent，不需要文件系统/子代理 | LangChain create_agent |
| 需要自定义图作为子代理 | LangGraph 图 -> 封装成 DeepAgents |

### 分项目指南

**选 LangChain**
- 做基础 LLM 应用
- prompt / tool chaining
- 需要高度自定义

**选 LangGraph**
- 复杂 agent workflow
- 企业级流程编排
- 需要精确控制执行流

**选 DeepAgents**
- 想快速做 autonomous agent
- coding / research agent
- 长任务执行系统
- 不想自己搭基础设施

**选 OpenCode**
- coding agent runtime
- repo 操作 / 自动开发系统
- sandbox 执行环境

说实话，这几个项目不是互斥的。我现在的做法是：用 LangGraph 搭核心编排，用 DeepAgents 拿现成的 infrastructure，跑在 OpenCode 的沙箱里。各层都有人做好了，自己只写业务逻辑。
