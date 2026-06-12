# s01: The Agent Loop

> **格言**: *"One loop & Bash is all you need"*
> **Harness 层**: 循环——模型与真实世界的第一次连接

## 解决的问题

语言模型能推理代码，但**摸不到**真实世界——不能读文件、不能跑测试、不能查错误。
没有循环，每次工具调用都需要手动复制粘贴结果——你就是那个循环。

## 解决方案

```
+--------+      +-------+      +---------+
|  User  | ---> |  LLM  | ---> |  Tool   |
| prompt |      |       |      | execute |
+--------+      +---+---+      +----+----+
                    ^                |
                    |   tool_result  |
                    +----------------+
                    (循环直到 stop_reason != "tool_use")
```

一个出口条件控制整个流程。循环运行直到模型停止调用工具。

## 代码要点

1. 用户 prompt 成为第一条消息
2. 发送 messages + tool definitions 给 LLM
3. 追加 assistant 响应，检查 `stop_reason`——如果不是 `"tool_use"` 就结束
4. 执行每个 tool call，收集结果，作为 user message 追加，然后回到步骤 2

```python
def agent_loop(query):
    messages = [{"role": "user", "content": query}]
    while True:
        response = client.messages.create(
            model=MODEL, system=SYSTEM, messages=messages,
            tools=TOOLS, max_tokens=8000,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            return

        results = []
        for block in response.content:
            if block.type == "tool_use":
                output = run_bash(block.input["command"])
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output,
                })
        messages.append({"role": "user", "content": results})
```

## 关键洞察

- 整个 agent 在 **30 行以内**
- 唯一的出口条件是 `stop_reason != "tool_use"`——**模型决定何时停止**
- 安全防护：预定义的 `dangerous` 命令黑名单
- 所有后续课程都在这之上叠加，**循环本身不变**

## 变化总结

| 组件 | 之前 | 之后 |
|------|------|------|
| Agent loop | (无) | `while True` + stop_reason |
| Tools | (无) | `bash`（一个工具） |
| Messages | (无) | 累积列表 |
| 控制流 | (无) | `stop_reason != "tool_use"` |

## 我的理解

这个 session 揭示了 AI Agent 最本质的模式：不是决策树、不是工作流引擎、不是提示词链——就是一个 `while` 循环，让模型自己决定什么时候该调用工具、什么时候该返回答案。Harness 的责任不是替模型做决策，而是提供执行环境。
