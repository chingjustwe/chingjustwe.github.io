# s11: Autonomous Agents

> **格言**: *"Teammates scan the board and claim tasks themselves"*
> **Harness 层**: Autonomy——不需要人告诉它们就自己找活干的模型

## 解决的问题

在 s09-s10 中，队友只在被明确告知时才工作。Lead 必须用特定 prompt 逐个生成每个队友。看板上有 10 个未认领的任务？Lead 手动分配每一个。不能扩展。

真正的自主：队友自己扫描任务看板、认领未认领的任务、工作、然后找更多任务。

一个微妙的问题：上下文压缩（s06）后，agent 可能忘记自己是谁。**身份重新注入**解决了这个问题。

## 解决方案

```
Teammate lifecycle with idle cycle:

+-------+
| spawn |
+---+---+
    |
    v
+-------+   tool_use     +-------+
| WORK  | <------------- |  LLM  |
+---+---+                +-------+
    |
    | stop_reason != tool_use (or idle tool called)
    v
+--------+
|  IDLE  |  poll every 5s for up to 60s
+---+----+
    |
    +---> check inbox --> message? ----------> WORK
    |
    +---> scan .tasks/ --> unclaimed? -------> claim -> WORK
    |
    +---> 60s timeout ----------------------> SHUTDOWN

Identity re-injection after compression:
  if len(messages) <= 3:
    messages.insert(0, identity_block)
```

## 代码要点

1. **队友循环有两个阶段**：WORK 和 IDLE。当 LLM 停止调用工具（或调用 `idle`）时进入 IDLE：

```python
def _loop(self, name, role, prompt):
    while True:
        # -- WORK PHASE --
        messages = [{"role": "user", "content": prompt}]
        for _ in range(50):
            response = client.messages.create(...)
            if response.stop_reason != "tool_use":
                break
            # execute tools...
            if idle_requested:
                break

        # -- IDLE PHASE --
        self._set_status(name, "idle")
        resume = self._idle_poll(name, messages)
        if not resume:
            self._set_status(name, "shutdown")
            return
        self._set_status(name, "working")
```

2. **IDLE 阶段轮询收件箱和任务看板**：

```python
def _idle_poll(self, name, messages):
    for _ in range(IDLE_TIMEOUT // POLL_INTERVAL):  # 60s / 5s = 12
        time.sleep(POLL_INTERVAL)
        inbox = BUS.read_inbox(name)
        if inbox:
            messages.append({"role": "user",
                "content": f"<inbox>{inbox}</inbox>"})
            return True
        unclaimed = scan_unclaimed_tasks()
        if unclaimed:
            claim_task(unclaimed[0]["id"], name)
            messages.append({"role": "user",
                "content": f"<auto-claimed>Task #{unclaimed[0]['id']}: "
                           f"{unclaimed[0]['subject']}</auto-claimed>"})
            return True
    return False  # 超时 -> shutdown
```

3. **扫描任务看板**：找到 pending、无 owner、无 blockedBy 的任务：

```python
def scan_unclaimed_tasks() -> list:
    unclaimed = []
    for f in sorted(TASKS_DIR.glob("task_*.json")):
        task = json.loads(f.read_text())
        if (task.get("status") == "pending"
                and not task.get("owner")
                and not task.get("blockedBy")):
            unclaimed.append(task)
    return unclaimed
```

4. **身份重新注入**：当上下文太短（压缩后），插入身份块：

```python
if len(messages) <= 3:
    messages.insert(0, {"role": "user",
        "content": f"<identity>You are '{name}', role: {role}, "
                   f"team: {team_name}. Continue your work.</identity>"})
    messages.insert(1, {"role": "assistant",
        "content": f"I am {name}. Continuing."})
```

## 关键洞察

- IDLE 轮询将 agent 从"被动响应"变为**主动寻找工作**
- 任务看板扫描和认领是**去中心化调度**——不需要中央分配器
- 身份重新注入是上下文压缩的**补偿机制**——确保压缩后 agent 仍然知道自己是谁
- 60s 超时自动关闭空闲队友，防止资源泄漏

## 变化总结

| 组件 | 之前 (s10) | 之后 (s11) |
|------|-----------|-----------|
| Tools | 12 | 14 (+idle, +claim_task) |
| 自主性 | Lead 指导 | 自组织 |
| Idle 阶段 | 无 | 轮询收件箱 + 任务看板 |
| 任务认领 | 仅手动 | 自动认领未分配任务 |
| 身份 | System prompt | + 压缩后重新注入 |
| 超时 | 无 | 60s 空闲 -> 自动关闭 |

## 我的理解

s11 是实现"真正的 AI Agent"的关键一步——**自主性**。只要在 harness 层面加上 IDLE 轮询和一个"找活干"的机制，模型就会表现出自主行为。

关键设计：轮询任务看板不是通过 LLM 每 5 秒做个"我现在该做什么"的推理调用——那是昂贵的。而是**在 harness 层面**用纯 Python 代码扫描 JSON 文件，找到可认领的任务后，再把它注入到 LLM 的上下文中。这是 harness 工程的精髓：用代码做确定性的、廉价的事情，让模型做需要推理的、昂贵的事情。

身份重新注入也是一个很实际的设计——当上下文被压缩后，模型就像"睡了一觉醒来不知道自己在哪"，需要重新告知它身份和任务。
