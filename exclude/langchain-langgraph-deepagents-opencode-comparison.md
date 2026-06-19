# LangChain / LangGraph / DeepAgents / OpenCode 对比总结

## 一、总体定位

| 项目 | 类型 | 核心定位 |
|------|------|----------|
| LangChain | Framework | LLM 应用开发框架 |
| LangGraph | Runtime | Agent 编排与执行运行时 |
| DeepAgents | Harness | 预置 Agent 操作系统级执行环境 |
| OpenCode | Runtime (System-level) | 面向 Coding Agent 的执行沙箱与工具运行时 |

---

## 二、核心差异一览

| 维度 | LangChain | LangGraph | DeepAgents | OpenCode |
|------|----------|------------|-------------|-----------|
| 抽象层级 | 低层工具封装 | 状态机/图编排 | Agent OS（高层封装） | 系统级执行环境 |
| 使用方式 | 手写 chain/agent | 定义 graph | 直接使用 agent preset | 直接运行 agent |
| 控制方式 | 开发者完全控制 | 开发者定义流程 | 约束 + 自动调度 | runtime 自动执行 |
| 复杂度 | 中 | 高 | 低 | 中 |
| 可定制性 | 极高 | 极高 | 中 | 中 |
| 面向用户 | 开发者 | Agent 架构设计者 | Agent 使用者 | Coding Agent 用户 |

---

## 三、设计理念差异

### 1. LangChain（Framework）

- 提供基础抽象（LLM / Tool / Memory）
- 不关心执行结构
- 一切由开发者组合

👉 本质：工具箱

---

### 2. LangGraph（Runtime）

- 用“图”定义 agent 执行流程
- 支持循环 / 分支 / 状态管理
- 适合复杂 workflow

👉 本质：可编程执行图

---

### 3. DeepAgents（Harness）

核心思想：

> 把 Agent 变成“操作系统级运行环境”

提供：

- 任务拆解（task / todo system）
- 子 agent（subprocess model）
- 文件系统 memory（external state）
- 自动上下文管理
- 权限与安全控制
- long-running 执行机制

👉 本质：Agent OS

---

### 4. OpenCode（Runtime）

核心思想：

> 让 Agent 能安全操作真实计算环境

提供：

- shell 执行
- git / repo 操作
- 文件系统访问
- sandbox 隔离
- MCP / tool runtime
- 长任务执行能力

👉 本质：Coding Agent 操作系统

---

## 四、执行模型对比

### LangChain
```
LLM → Tool → LLM → Tool
```

### LangGraph
```
Node A → Node B → Node C
   ↑         ↓
   └─────────┘
```

### DeepAgents
```
Agent
 ├── Planner (todo system)
 ├── SubAgent (isolated workers)
 ├── File System (external memory)
 ├── Tool Runtime
 └── Context Manager
```

### OpenCode
```
Agent
 ├── Sandbox Runtime
 ├── File System
 ├── Shell / Git
 ├── MCP Tools
 └── Permission Layer
```

---

## 五、核心区别总结

### LangChain
> “帮你搭积木”

### LangGraph
> “帮你设计流程图”

### DeepAgents
> “帮你直接给一个能干活的 Agent 操作系统”

### OpenCode
> “帮你提供一个安全执行环境，让 Agent 能操作真实世界”

---

## 六、关系总结（非常重要）

它们不是替代关系，而是层级关系：

```
LangChain (基础能力)
   ↓
LangGraph (编排层)
   ↓
DeepAgents (Agent OS 封装层)
   ↓
OpenCode (系统级执行 Runtime)
```

---

## 七、选型建议

### 选 LangChain
- 做基础 LLM 应用
- prompt / tool chaining

### 选 LangGraph
- 复杂 agent workflow
- 企业级流程编排

### 选 DeepAgents
- 想快速做 autonomous agent
- coding / research agent
- 长任务执行系统

### 选 OpenCode
- coding agent runtime
- repo 操作 / 自动开发系统
- sandbox 执行环境

---
