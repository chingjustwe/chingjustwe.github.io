
## DeepAgents 与 LangChain / LangGraph 的关系

| 场景 | 用什么 |
|------|--------|
| 简单的链式调用 | LangChain LCEL |
| 自定义图编排、状态机 | LangGraph |
| 开箱即用的复杂 Agent | **Deep Agents** |
| 需要 Agent 但不用文件系统/子代理 | LangChain `create_agent` |
| 需要自定义图作为子代理 | LangGraph 图 → Deep Agents |

**Deep Agents 最强的场景**：长期运行的、多步骤的、需要规划 + 文件系统 + 委派的 Agent 任务。如自动化研究、代码审查、文档生成等工作流。

---

## Architecture Deep Dive，harness 体现在什么地方？

### `create_deep_agent` 内部发生了什么？

你写的 `agent = create_deep_agent(model=..., tools=[...])` 实际上做了一整套 LangGraph 图装配。下图展示了它内部构造的完整状态机：

```
┌──────────────────────────────────────────────────────────────┐
│  create_deep_agent (deepagents)                               │
│                                                               │
│  1. 解析 model / tools / subagents / permissions ...           │
│  2. 组装 middleware 栈:                                        │
│     ┌─ TodoListMiddleware        (write_todos / read_todos)    │
│     ├─ SkillsMiddleware          (可选，技能文件)              │
│     ├─ FilesystemMiddleware      (ls/read/write/edit/glob/grep)│
│     ├─ SubAgentMiddleware        (task 工具 → 子代理)         │
│     ├─ SummarizationMiddleware   (上下文压缩)                  │
│     ├─ PatchToolCallsMiddleware  (工具调用修正)                │
│     ├─ User Middleware           (你传入的 middleware)         │
│     ├─ MemoryMiddleware          (可选，AGENTS.md)             │
│     └─ HumanInTheLoopMiddleware  (可选，interrupt_on)         │
│                                                               │
│  3. 调用 create_agent(...) → 构建 LangGraph StateGraph         │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│  create_agent (langchain.agents)                             │
│                                                               │
│  graph = StateGraph(AgentState)                               │
│                                                               │
│  Nodes:                                                       │
│    model  ── LLM 调用节点（你传的 ChatOpenAI / ChatAnthropic）│
│    tools  ── ToolNode（执行所有工具调用）                       │
│    *.before_model / *.after_model  ── middleware 钩子         │
│    *.before_tools / *.after_tools  ── middleware 钩子         │
│                                                               │
│  Edges (就是 ReAct 循环):                                      │
│    START ──────────────────────→ entry_node                   │
│    model ──→ tools  (有 tool_calls 时)                       │
│    model ──→ exit   (无 tool_calls 时)                       │
│    tools ──→ model  (循环回 LLM)                              │
│    model ──→ *.after_model  (middleware 处理)                │
│    loop_exit_node ──→ exit_node                               │
│                                                               │
│  return graph.compile() → CompiledStateGraph                   │
└──────────────────────────────────────────────────────────────┘
```

### 核心要点

| 你看到的部分 | 隐藏的部分 |
|---|---|
| `create_deep_agent(model=..., tools=[...])` | 内部构造了完整的 LangGraph `StateGraph` |
| `agent.invoke({"messages": [...]})` | 在图里反复循环：`model → tools → model → tools → ...` |
| 只传了 2 个自定义工具 | 框架自动注入 `write_todos` / `ls` / `read_file` / `write_file` / `execute` / `task`（总共约 10+ 工具） |
| `tools=[get_current_time, search_files]` | 这些被合并到同一个 ToolNode 中，和内置工具无区别 |
| 看起来是一次性调用 | 实际内部可能跑了多轮（LLM → 调工具 → 结果喂回 LLM → 再调工具 → ...） |

### Harness 指什么？

"Harness" 不是某个类，而是**整套基础设施**的统称：

- **Graph 结构** — StateGraph + nodes + edges（状态传递、循环控制）
- **Middleware 栈** — 每个 middleware 在模型调用和工具执行前后注入行为（文件系统、摘要、记忆等）
- **内置工具** — planning / filesystem / execution / task delegation
- **Profile 系统** — 根据模型自动选择优化的 system prompt 和 tool description（例如 Claude 有特定 profile）
- **Subagent 管理** — context isolation、工具继承、状态隔离

你可以通过 `HarnessProfile` 定制这套行为，但默认值已经开箱即用。

### 验证方法

```python
agent = create_deep_agent(model=model, tools=[...])

# agent 的本质是一个 CompiledStateGraph
print(type(agent))
# <class 'langgraph.graph.state.CompiledStateGraph'>

# 打印图结构（文本版）
print(agent.get_graph().draw_ascii())

# 查看所有已注册的工具（包括内置的）
print([t.name for t in agent._tools])

# 查看运行时的图调用链
agent.invoke({"messages": [...]}, debug=True)
```
