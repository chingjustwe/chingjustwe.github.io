# s06: Context Compact

> **格言**: *"Context will fill up; you need a way to make room"*
> **Harness 层**: Compression——为无限会话提供干净记忆

## 解决的问题

上下文窗口是有限的。一次 `read_file` 读取 1000 行文件大约花费 4000 tokens。读完 30 个文件、运行 20 个 bash 命令后，就会达到 100,000+ tokens。没有压缩，agent 无法在大型代码库上工作。

## 解决方案

三层压缩，渐增的激进程度：

```
Every turn:
+------------------+
| Tool call result |
+------------------+
        |
        v
[Layer 1: micro_compact]        (静默，每轮执行)
  替换 > 3 轮前的 tool_result
  为 "[Previous: used {tool_name}]"
        |
        v
[Check: tokens > 50000?]
   |               |
   no              yes
   |               |
   v               v
continue    [Layer 2: auto_compact]
              Save transcript to .transcripts/
              LLM summarizes conversation.
              Replace all messages with [summary].
                    |
                    v
            [Layer 3: compact tool]
              Model calls compact explicitly.
              Same summarization as auto_compact.
```

## 代码要点

1. **Layer 1 — micro_compact**：每次 LLM 调用前，把旧的 tool results 替换为占位符：

```python
def micro_compact(messages: list) -> list:
    tool_results = []
    for i, msg in enumerate(messages):
        if msg["role"] == "user" and isinstance(msg.get("content"), list):
            for j, part in enumerate(msg["content"]):
                if isinstance(part, dict) and part.get("type") == "tool_result":
                    tool_results.append((i, j, part))
    if len(tool_results) <= KEEP_RECENT:
        return messages
    for _, _, part in tool_results[:-KEEP_RECENT]:
        if len(part.get("content", "")) > 100:
            part["content"] = f"[Previous: used {tool_name}]"
    return messages
```

2. **Layer 2 — auto_compact**：当 token 超过阈值时，保存完整转录到磁盘，然后让 LLM 总结：

```python
def auto_compact(messages: list) -> list:
    transcript_path = TRANSCRIPT_DIR / f"transcript_{int(time.time())}.jsonl"
    with open(transcript_path, "w") as f:
        for msg in messages:
            f.write(json.dumps(msg, default=str) + "\n")
    response = client.messages.create(
        model=MODEL,
        messages=[{"role": "user", "content":
            "Summarize this conversation for continuity..."
            + json.dumps(messages, default=str)[:80000]}],
        max_tokens=2000,
    )
    return [
        {"role": "user", "content": f"[Compressed]\n\n{response.content[0].text}"},
    ]
```

3. **Layer 3 — manual compact**：`compact` 工具按需触发同样的总结。

4. **循环整合三者**：

```python
def agent_loop(messages: list):
    while True:
        micro_compact(messages)                        # Layer 1
        if estimate_tokens(messages) > THRESHOLD:
            messages[:] = auto_compact(messages)       # Layer 2
        response = client.messages.create(...)
        if manual_compact:
            messages[:] = auto_compact(messages)       # Layer 3
```

## 关键洞察

- 转录保存在磁盘上，**没有真正丢失任何东西**——只是移出了活跃上下文
- micro_compact 使用字符串长度近似估算 token 数（`len(json_string) // 4`），这是一个务实的简化
- 最妙的是：**压缩本身也使用 LLM**——让模型帮忙总结自己的对话，这是"元认知"

## 变化总结

| 组件 | 之前 (s05) | 之后 (s06) |
|------|-----------|-----------|
| Tools | 5 | 5 (base + compact) |
| Context mgmt | 无 | 三层压缩 |
| Micro-compact | 无 | 旧结果 -> 占位符 |
| Auto-compact | 无 | Token 阈值触发 |
| Transcripts | 无 | 保存到 .transcripts/ |

## 我的理解

三层压缩策略像极了操作系统内存管理：
- **micro_compact** = L1 cache：快速、静默、每轮执行
- **auto_compact** = L2 cache：更积极、触发时有成本
- **manual compact** = 用户手动刷新

尤其喜欢 auto_compact 使用 LLM 自己来做总结——这是一个自指（self-referential）设计模式：don't write a summarizer, let the model do it。
