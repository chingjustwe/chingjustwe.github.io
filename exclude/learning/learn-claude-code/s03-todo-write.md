# s03: TodoWrite

> **格言**: *"An agent without a plan drifts"*
> **Harness 层**: Planning——在不预设路线的情况下让模型保持方向

## 解决的问题

在多步骤任务中，模型会迷失方向：重复工作、跳过步骤、走神。长对话让问题更严重——随着 tool results 填满上下文，system prompt 逐渐被"淹没"。10 步重构可能完成 1-3 步后模型就开始即兴发挥，因为它忘了 4-10 步。

## 解决方案

```
+--------+      +-------+      +---------+
|  User  | ---> |  LLM  | ---> | Tools   |
| prompt |      |       |      | + todo  |
+--------+      +---+---+      +----+----+
                    ^                |
                    |   tool_result  |
                    +----------------+
                          |
              +-----------+-----------+
              | TodoManager state     |
              | [ ] task A            |
              | [>] task B  <- doing  |
              | [x] task C            |
              +-----------------------+
                          |
              if rounds_since_todo >= 3:
                inject <reminder> into tool_result
```

## 代码要点

1. **TodoManager**：存储带状态的项目。一次只能有一个 `in_progress`：

```python
class TodoManager:
    def update(self, items: list) -> str:
        validated, in_progress_count = [], 0
        for item in items:
            status = item.get("status", "pending")
            if status == "in_progress":
                in_progress_count += 1
            validated.append({"id": item["id"], "text": item["text"],
                              "status": status})
        if in_progress_count > 1:
            raise ValueError("Only one task can be in_progress")
        self.items = validated
        return self.render()
```

2. `todo` 工具像其他工具一样注册进 dispatch map：

```python
TOOL_HANDLERS = {
    "todo": lambda **kw: TODO.update(kw["items"]),
}
```

3. **Nag reminder**：如果模型连续 3+ 轮没调用 `todo`，注入提醒：

```python
if rounds_since_todo >= 3 and messages:
    last = messages[-1]
    if last["role"] == "user" and isinstance(last.get("content"), list):
        last["content"].insert(0, {
            "type": "text",
            "text": "<reminder>Update your todos.</reminder>",
        })
```

## 关键洞察

- "一次只能有一个 in_progress" 强制造**顺序聚焦**
- Nag reminder 创造**问责机制**
- 这不是任务管理（那是 s07），这是**轻量级规划**——帮助模型在短期内保持方向

## 变化总结

| 组件 | 之前 (s02) | 之后 (s03) |
|------|-----------|-----------|
| Tools | 4 | 5 (+todo) |
| Planning | 无 | TodoManager with statuses |
| Nag injection | 无 | `<reminder>` after 3 rounds |
| Agent loop | Simple dispatch | + rounds_since_todo counter |

## 我的理解

TodoWrite 是个精巧的"轻干预"设计。它不给模型硬性规定做什么，而是给模型一个**自我表达计划的工具**，再加一个**温和的提醒机制**。这体现了 harness 工程的一个重要哲学：引导而非控制。模型仍然完全自主——它可以选择忽略 reminder，但大多数时候 reminder 足够让它回到正轨。
