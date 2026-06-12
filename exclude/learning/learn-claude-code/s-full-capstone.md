# s_full: 总纲 + 架构全景图

> 所有机制合一——模型的完整驾驶舱。

## 全景架构

`agents/s_full.py` 是 s01-s11 所有机制的整合（s12 作为独立教学保持分离）。

```
                    +------------------------------------------+
                    |           FULL AGENT (s_full)            |
                    +------------------------------------------+
                    |                                          |
                    |  System prompt (s05: skill descriptions) |
                    |  + task-first + optional todo nag         |
                    |                                          |
                    |  Before each LLM call:                    |
                    |  +------------------+  +----------------+ |
                    |  | Microcompact(s06)|  | Drain bg(s08) | |
                    |  | Auto-compact(s06)|  | notifications  | |
                    |  +------------------+  +----------------+ |
                    |                                          |
                    |  Tool dispatch (s02):                     |
                    |  +------+------+------+-------+---------+ |
                    |  | bash | read | write| edit  |TodoWrite| |
                    |  | task |ld_sk |cmprs |bg_run |bg_check | |
                    |  |t_crt |t_get |t_upd |t_list |spawn_tm | |
                    |  |lst_tm|sndMsg|rdInbx|bcast  |shutdown | |
                    |  | plan | idle |claim |       |         | |
                    |  +------+------+------+-------+---------+ |
                    |                                          |
                    |  Subagent (s04): spawn -> work -> summary |
                    |  Teammate (s09): spawn -> work -> idle -> |
                    |    auto-claim (s11)                       |
                    |  Shutdown (s10): request_id handshake     |
                    |  Plan gate (s10): submit -> approve/reject|
                    +------------------------------------------+
```

## 机制依赖图

```
s01 Agent Loop (核心骨架)
 |-- s02 Tool Dispatch (工具可插拔化)
      |-- s03 TodoWrite (规划辅助)
      |    |-- s04 Subagent (上下文隔离)
      |    |    |-- s05 Skill Loading (按需知识)
      |    |         |-- s06 Context Compact (上下文管理)
      |    |              |-- s07 Task System (任务持久化)
      |    |                   |-- s08 Background Tasks (异步执行)
      |    |                        |-- s09 Agent Teams (多 agent 通信)
      |    |                             |-- s10 Team Protocols (结构化握手)
      |    |                                  |-- s11 Autonomous (自主认领)
      |    |                                       |-- s12 Worktree (目录隔离)
 s02 为所有后续提供工具注册机制
```

## 每个机制的 Harness 层次

| # | 机制 | Harness 层 | 一句话描述 |
|---|------|-----------|-----------|
| s01 | Agent Loop | 循环 | 模型与真实世界的第一次连接 |
| s02 | Tool Use | 工具调度 | 扩展模型能触及的范围 |
| s03 | TodoWrite | 规划 | 在不预设路线的情况下让模型保持方向 |
| s04 | Subagent | 上下文隔离 | 保护模型思维清晰度 |
| s05 | Skills | 按需知识 | 领域专业知识，模型需要时加载 |
| s06 | Context Compact | 压缩 | 为无限会话提供干净记忆 |
| s07 | Task System | 持久任务 | 比任何单次对话活得更久的目标 |
| s08 | Background Tasks | 异步执行 | 模型思考时 harness 等待 |
| s09 | Agent Teams | 团队邮箱 | 多个模型通过文件协调 |
| s10 | Team Protocols | 通信协议 | 模型之间结构化握手 |
| s11 | Autonomous Agents | 自主性 | 模型自己找活干 |
| s12 | Worktree Isolation | 目录隔离 | 永不碰撞的并行执行通道 |

## 循环始终不变

```python
def agent_loop(messages):
    while True:
        # s06: 压缩管道
        microcompact(messages)
        if estimate_tokens(messages) > TOKEN_THRESHOLD:
            messages[:] = auto_compact(messages)

        # s08: 排出后台通知
        notifs = BG.drain()
        if notifs:
            messages.append({"role": "user", "content": notif_xml})

        # s10: 检查 lead 收件箱
        inbox = BUS.read_inbox("lead")
        if inbox:
            messages.append({"role": "user", "content": inbox_xml})

        # LLM 调用（核心循环）
        response = client.messages.create(
            model=MODEL, system=SYSTEM, messages=messages,
            tools=TOOLS, max_tokens=8000,
        )
        messages.append({"role": "assistant", "content": response.content})
        if response.stop_reason != "tool_use":
            return

        # 工具执行
        results = []
        for block in response.content:
            if block.type == "tool_use":
                handler = TOOL_HANDLERS.get(block.name)
                output = handler(**block.input) if handler else "Unknown"
                results.append({"type": "tool_result", ...})

        # s03: nag reminder（仅当 todo 工作流活跃时）
        rounds_without_todo = 0 if used_todo else rounds_without_todo + 1
        if TODO.has_open_items() and rounds_without_todo >= 3:
            results.append({"type": "text", "text": "<reminder>..."})

        messages.append({"role": "user", "content": results})

        # s06: 手动压缩
        if manual_compress:
            messages[:] = auto_compact(messages)
```

## Harness 工程核心原则

1. **循环属于 Agent，机制属于 Harness** — 核心 loop 从 s01 到 s12 没有本质变化
2. **一个工具 = 一个 handler** — 通过 dispatch map 实现可插拔工具
3. **用代码做确定性的事** — 任务扫描、路径验证、通知排出用纯 Python
4. **让模型做需要推理的事** — 工具选择、计划制定、总结、代码编写
5. **文件即状态** — JSON 文件比内存更可靠，比数据库更简单
6. **安全在工具层面实施** — sandbox、黑名单、路径检查在 harness 层，不留到模型层
7. **通信原语优先于通信协议** — 先用 JSONL 邮箱让 agent 能通信，再加结构化协议
8. **渐进式复杂度** — 每个 session 只加一个机制，每个机制有自己的格言

## 名词解释

| 术语 | 含义 |
|------|------|
| **Harness** | Agent 在特定领域工作所需的一切：工具、知识、观察接口、行动接口、权限控制 |
| **Agency** | 模型感知、推理、行动的能力——来自训练，不是来自代码编排 |
| **Agent Loop** | `while stop_reason == "tool_use"` 的核心模式 |
| **Dispatch Map** | `{tool_name: handler_function}` 的字典，一个查找取代 if/elif 链 |
| **Subagent** | 有独立 `messages[]` 的 child agent，上下文隔离，用完即弃 |
| **Worktree** | 通过 git worktree 创建的文件系统隔离目录 |
| **JSONL Mailbox** | 只追加、读取即清空的文件级通信原语 |
| **FSM** | 有限状态机，用于 shutdown/plan approval 等协议的 `pending -> approved/rejected` 模式 |
