# Learn Claude Code -- Harness Engineering 学习笔记

> 通过学习 [learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 仓库来掌握 Agent Harness 工程。

## 核心认知

**Agency — 感知、推理、行动的能力 — 来自模型训练，不是外部代码编排。**
**Agent 产品 = 模型 + Harness。模型是驾驶者，Harness 是载具。**

Harness 工程师的工作：不是编写智能，而是构建智能栖居的世界。

```
Harness = Tools + Knowledge + Observation + Action Interfaces + Permissions
```

## 学习路径

### Phase 1: THE LOOP (循环)

| # | 主题 | 核心格言 | 笔记 |
|---|------|---------|------|
| s01 | Agent Loop | *One loop & Bash is all you need* | [笔记](./s01-agent-loop.md) |
| s02 | Tool Use | *Adding a tool means adding one handler* | [笔记](./s02-tool-use.md) |

### Phase 2: PLANNING & KNOWLEDGE (规划与知识)

| # | 主题 | 核心格言 | 笔记 |
|---|------|---------|------|
| s03 | TodoWrite | *An agent without a plan drifts* | [笔记](./s03-todo-write.md) |
| s04 | Subagents | *Break big tasks down; each subtask gets a clean context* | [笔记](./s04-subagent.md) |
| s05 | Skills | *Load knowledge when you need it, not upfront* | [笔记](./s05-skill-loading.md) |
| s06 | Context Compact | *Context will fill up; you need a way to make room* | [笔记](./s06-context-compact.md) |

### Phase 3: PERSISTENCE (持久化)

| # | 主题 | 核心格言 | 笔记 |
|---|------|---------|------|
| s07 | Task System | *Break big goals into small tasks, order them, persist to disk* | [笔记](./s07-task-system.md) |
| s08 | Background Tasks | *Run slow operations in the background; the agent keeps thinking* | [笔记](./s08-background-tasks.md) |

### Phase 4: TEAMS (团队协作)

| # | 主题 | 核心格言 | 笔记 |
|---|------|---------|------|
| s09 | Agent Teams | *When the task is too big for one, delegate to teammates* | [笔记](./s09-agent-teams.md) |
| s10 | Team Protocols | *Teammates need shared communication rules* | [笔记](./s10-team-protocols.md) |
| s11 | Autonomous Agents | *Teammates scan the board and claim tasks themselves* | [笔记](./s11-autonomous-agents.md) |
| s12 | Worktree + Task Isolation | *Each works in its own directory, no interference* | [笔记](./s12-worktree-task-isolation.md) |

## 架构总览

- [s_full 总纲 + 架构全景图](./s-full-capstone.md)

## 核心模式 (Core Pattern)

```python
def agent_loop(messages):
    while True:
        response = client.messages.create(
            model=MODEL, system=SYSTEM,
            messages=messages, tools=TOOLS,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            return

        results = []
        for block in response.content:
            if block.type == "tool_use":
                output = TOOL_HANDLERS[block.name](**block.input)
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output,
                })
        messages.append({"role": "user", "content": results})
```

每个 session 在这个循环之上叠加一个 harness 机制——循环本身始终不变。
循环属于 agent。机制属于 harness。