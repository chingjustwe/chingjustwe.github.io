# s02: Tool Use

> **格言**: *"Adding a tool means adding one handler"*
> **Harness 层**: Tool Dispatch——扩展模型能触及的范围

## 解决的问题

只有 `bash` 一个工具时，agent 所有操作都通过 shell。`cat` 截断不可预测，`sed` 在特殊字符上失败，每个 bash 调用都是不受约束的安全面。专用工具（如 `read_file`、`write_file`）让你能在工具层面实施路径沙箱。

关键洞察：**增加工具不需要改循环**。

## 解决方案

```
+--------+      +-------+      +------------------+
|  User  | ---> |  LLM  | ---> | Tool Dispatch    |
| prompt |      |       |      | {                |
+--------+      +---+---+      |   bash: run_bash |
                    ^           |   read: run_read |
                    |           |   write: run_wr  |
                    +-----------+   edit: run_edit |
                    tool_result | }                |
                                +------------------+

Dispatch map 就是一个 dict: {tool_name: handler_function}
一个查找取代任何 if/elif 链
```

## 代码要点

1. **每个工具都有一个 handler 函数**。路径沙箱防止逃逸工作区：

```python
def safe_path(p: str) -> Path:
    path = (WORKDIR / p).resolve()
    if not path.is_relative_to(WORKDIR):
        raise ValueError(f"Path escapes workspace: {p}")
    return path
```

2. **Dispatch map** 将工具名链接到 handlers：

```python
TOOL_HANDLERS = {
    "bash":       lambda **kw: run_bash(kw["command"]),
    "read_file":  lambda **kw: run_read(kw["path"], kw.get("limit")),
    "write_file": lambda **kw: run_write(kw["path"], kw["content"]),
    "edit_file":  lambda **kw: run_edit(kw["path"], kw["old_text"],
                                        kw["new_text"]),
}
```

3. **循环体不变**——在循环中按名称查找 handler：

```python
for block in response.content:
    if block.type == "tool_use":
        handler = TOOL_HANDLERS.get(block.name)
        output = handler(**block.input) if handler \
            else f"Unknown tool: {block.name}"
```

## 关键洞察

增加一个工具 = 加一个 handler + 加一个 schema 条目。循环永远不需要变。

这也体现了安全工程与 harness 工程的交汇点：**路径沙箱**在工具层面实施安全策略，而不是依赖模型自我约束。

## 变化总结

| 组件 | 之前 (s01) | 之后 (s02) |
|------|-----------|-----------|
| Tools | 1 (bash only) | 4 (bash, read, write, edit) |
| Dispatch | 硬编码 bash 调用 | `TOOL_HANDLERS` dict |
| 路径安全 | 无 | `safe_path()` 沙箱 |
| Agent loop | 不变 | 不变 |

## 我的理解

s02 展示了 harness 工程的一个重要原则：**工具是可插拔的**。通过 dispatch map 模式，新工具可以"注册"进系统而不需要修改核心循环。`safe_path()` 是个精妙的设计——在工具层面做安全控制，比在模型层面用 prompt 约束要可靠得多。
