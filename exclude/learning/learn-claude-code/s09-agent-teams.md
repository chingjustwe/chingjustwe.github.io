# s09: Agent Teams

> **格言**: *"When the task is too big for one, delegate to teammates"*
> **Harness 层**: Team Mailboxes——多个模型通过文件协调

## 解决的问题

Subagent（s04）是一次性的：生成、工作、返回摘要、死亡。没有身份，调用之间没有记忆。Background tasks（s08）可以运行 shell 命令但不能做出 LLM 引导的决策。

真正的团队工作需要：(1) 比单次 prompt 活得更久的持久 agent，(2) 身份和生命周期管理，(3) agent 之间的通信通道。

## 解决方案

```
Teammate lifecycle:
  spawn -> WORKING -> IDLE -> WORKING -> ... -> SHUTDOWN

Communication:
  .team/
    config.json           <- 团队名册 + 状态
    inbox/
      alice.jsonl         <- 只追加，读取即清空
      bob.jsonl
      lead.jsonl

              +--------+    send("alice","bob","...")    +--------+
              | alice  | -----------------------------> |  bob   |
              | loop   |    bob.jsonl << {json_line}    |  loop  |
              +--------+                                +--------+
                   ^                                         |
                   |        BUS.read_inbox("alice")          |
                   +---- alice.jsonl -> read + drain ---------+
```

## 代码要点

1. **TeammateManager**：维护 config.json 与团队名册：

```python
class TeammateManager:
    def __init__(self, team_dir: Path):
        self.dir = team_dir
        self.dir.mkdir(exist_ok=True)
        self.config_path = self.dir / "config.json"
        self.config = self._load_config()
        self.threads = {}
```

2. `spawn()` 创建队友并在线程中启动其 agent 循环：

```python
def spawn(self, name: str, role: str, prompt: str) -> str:
    member = {"name": name, "role": role, "status": "working"}
    self.config["members"].append(member)
    self._save_config()
    thread = threading.Thread(
        target=self._teammate_loop,
        args=(name, role, prompt), daemon=True)
    thread.start()
    return f"Spawned teammate '{name}' (role: {role})"
```

3. **MessageBus**：只追加的 JSONL 收件箱。`send()` 追加一行 JSON；`read_inbox()` 读取全部并清空：

```python
class MessageBus:
    def send(self, sender, to, content, msg_type="message", extra=None):
        msg = {"type": msg_type, "from": sender,
               "content": content, "timestamp": time.time()}
        if extra:
            msg.update(extra)
        with open(self.dir / f"{to}.jsonl", "a") as f:
            f.write(json.dumps(msg) + "\n")

    def read_inbox(self, name):
        path = self.dir / f"{name}.jsonl"
        if not path.exists(): return "[]"
        msgs = [json.loads(l) for l in path.read_text().strip().splitlines() if l]
        path.write_text("")  # 清空
        return json.dumps(msgs, indent=2)
```

4. **每个队友在每次 LLM 调用前检查收件箱**，将收到的消息注入上下文：

```python
def _teammate_loop(self, name, role, prompt):
    messages = [{"role": "user", "content": prompt}]
    for _ in range(50):
        inbox = BUS.read_inbox(name)
        if inbox != "[]":
            messages.append({"role": "user",
                "content": f"<inbox>{inbox}</inbox>"})
        response = client.messages.create(...)
        if response.stop_reason != "tool_use":
            break
        # execute tools, append results...
    self._find_member(name)["status"] = "idle"
```

## 关键洞察

- **JSONL 邮箱是基础通信原语**——只追加、读取即清空。没有锁、没有竞争条件，因为文件系统的追加是原子的
- 每个队友运行在自己的线程中，有自己的 agent loop——**多个 LLM 调用并行**
- 身份和状态持久化在 `config.json`——即使主进程重启也可以恢复
- s04 的 subagent = 一次性工人，s09 的 teammate = 持久化同事

## 变化总结

| 组件 | 之前 (s08) | 之后 (s09) |
|------|-----------|-----------|
| Tools | 6 | 9 (+spawn/send/read_inbox) |
| Agents | 单个 | Lead + N teammates |
| 持久性 | 无 | config.json + JSONL inboxes |
| 线程 | 后台命令 | 每线程完整 agent loop |
| 生命周期 | 发后即忘 | idle -> working -> idle |
| 通信 | 无 | message + broadcast |

## 我的理解

s09 实现了多 agent 团队的**通信基础设施**。关键洞察是：不需要复杂 RPC 框架、消息队列或服务发现——只需要**文件**。JSONL 文件作为邮箱提供了持久性（不丢消息）和隔离性（每个队友只读自己的文件）。这是"Bash is all you need"哲学的延伸：用文件系统做分布式通信。
