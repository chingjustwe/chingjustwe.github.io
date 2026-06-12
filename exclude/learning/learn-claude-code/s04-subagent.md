# s04: Subagents

> **格言**: *"Break big tasks down; each subtask gets a clean context"*
> **Harness 层**: Context Isolation——保护模型思维清晰度

## 解决的问题

随着 agent 工作，它的 messages 数组不断增长。每个文件读取、每个 bash 输出永久留在上下文中。"这个项目用什么测试框架？"可能需要读 5 个文件，但父 agent 只需要答案："pytest"。

## 解决方案

```
Parent agent                     Subagent
+------------------+             +------------------+
| messages=[...]   |             | messages=[]      | <-- 全新的
|                  |  dispatch   |                  |
| tool: task       | ----------> | while tool_use:  |
|   prompt="..."   |             |   call tools     |
|                  |  summary    |   append results |
|   result = "..." | <---------- | return last text |
+------------------+             +------------------+

父上下文保持干净。子上下文被丢弃。
```

## 代码要点

1. **父 agent 获得 `task` 工具**，子 agent 只拿到基础工具（无递归生成）：

```python
PARENT_TOOLS = CHILD_TOOLS + [
    {"name": "task",
     "description": "Spawn a subagent with fresh context.",
     "input_schema": {
         "type": "object",
         "properties": {"prompt": {"type": "string"}},
         "required": ["prompt"],
     }},
]
```

2. **子 agent 以 `messages=[]` 启动**，运行自己的循环。只有最终文本返回给父 agent：

```python
def run_subagent(prompt: str) -> str:
    sub_messages = [{"role": "user", "content": prompt}]
    for _ in range(30):  # safety limit
        response = client.messages.create(
            model=MODEL, system=SUBAGENT_SYSTEM,
            messages=sub_messages,
            tools=CHILD_TOOLS, max_tokens=8000,
        )
        sub_messages.append({"role": "assistant",
                             "content": response.content})
        if response.stop_reason != "tool_use":
            break
        results = []
        for block in response.content:
            if block.type == "tool_use":
                handler = TOOL_HANDLERS.get(block.name)
                output = handler(**block.input)
                results.append({"type": "tool_result",
                    "tool_use_id": block.id,
                    "content": str(output)[:50000]})
        sub_messages.append({"role": "user", "content": results})
    return "".join(
        b.text for b in response.content if hasattr(b, "text")
    ) or "(no summary)"
```

## 关键洞察

- 子的整个消息历史（可能 30+ 个 tool calls）被丢弃。父 agent 接收到的只是一段摘要，像一个普通的 `tool_result`
- **30 轮的安全限制**防止子 agent 无限循环
- 这也体现了 compute 的嵌套调度：父 agent 消耗 token 做推理和规划，子 agent 消耗 token 做具体执行

## 变化总结

| 组件 | 之前 (s03) | 之后 (s04) |
|------|-----------|-----------|
| Tools | 5 | 5 (base) + task (parent) |
| Context | 单一共享 | Parent + child 隔离 |
| Subagent | 无 | `run_subagent()` 函数 |
| 返回值 | N/A | 仅摘要文本 |

## 我的理解

Subagent 模式是 harness 工程中的**上下文隔离**核心手段。每次子任务独立运行在干净的上下文中，既防止了"上下文污染"（父对话中的噪声干扰子任务），又防止了"上下文膨胀"（子任务的大量 I/O 撑爆父对话）。

注意父 agent 和子 agent 共用**同一个模型**（同一个 API key），但运行在不同的消息上下文中。这是单一模型通过 harness 机制实现"分身"的关键模式。
