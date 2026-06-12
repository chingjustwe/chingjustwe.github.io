# s08: Background Tasks

> **格言**: *"Run slow operations in the background; the agent keeps thinking"*
> **Harness 层**: Background Execution——模型思考时 Harness 等待

## 解决的问题

有些命令需要几分钟：`npm install`、`pytest`、`docker build`。使用阻塞循环，模型闲置等待。如果用户说"安装依赖，同时创建配置文件"，agent 会顺序执行，而不是并行。

## 解决方案

```
Main thread                Background thread
+-----------------+        +-----------------+
| agent loop      |        | subprocess runs |
| ...             |        | ...             |
| [LLM call] <---+------- | enqueue(result) |
|  ^drain queue   |        +-----------------+
+-----------------+

Timeline:
Agent --[spawn A]--[spawn B]--[other work]----
             |          |
             v          v
          [A runs]   [B runs]      (并行)
             |          |
             +-- results injected before next LLM call --+
```

## 代码要点

1. **BackgroundManager**：用线程安全的通知队列跟踪任务：

```python
class BackgroundManager:
    def __init__(self):
        self.tasks = {}
        self._notification_queue = []
        self._lock = threading.Lock()
```

2. `run()` 启动守护线程并立即返回：

```python
def run(self, command: str) -> str:
    task_id = str(uuid.uuid4())[:8]
    self.tasks[task_id] = {"status": "running", "command": command}
    thread = threading.Thread(
        target=self._execute, args=(task_id, command), daemon=True)
    thread.start()
    return f"Background task {task_id} started"
```

3. 子进程结束时，结果进入通知队列：

```python
def _execute(self, task_id, command):
    try:
        r = subprocess.run(command, shell=True, cwd=WORKDIR,
            capture_output=True, text=True, timeout=300)
        output = (r.stdout + r.stderr).strip()[:50000]
    except subprocess.TimeoutExpired:
        output = "Error: Timeout (300s)"
    with self._lock:
        self._notification_queue.append({
            "task_id": task_id, "result": output[:500]})
```

4. **agent 循环在每次 LLM 调用前排出通知**：

```python
def agent_loop(messages: list):
    while True:
        notifs = BG.drain_notifications()
        if notifs:
            notif_text = "\n".join(
                f"[bg:{n['task_id']}] {n['result']}" for n in notifs)
            messages.append({"role": "user",
                "content": f"<background-results>\n{notif_text}\n"
                           f"</background-results>"})
        response = client.messages.create(...)
```

## 关键洞察

- 循环保持单线程。**只有子进程 I/O 是并行的**
- 通知在每次 LLM 调用前注入，所以模型**永远不会错过**已完成的后台任务的信息
- `drain()` 清空队列的方式确保了不会重复通知

## 变化总结

| 组件 | 之前 (s07) | 之后 (s08) |
|------|-----------|-----------|
| Tools | 8 | 6 (base + background_run + check) |
| 执行模式 | 仅阻塞 | 阻塞 + 后台线程 |
| 通知机制 | 无 | 每轮循环排出队列 |
| 并发 | 无 | 守护线程 |

## 我的理解

s08 让 agent 有了"非阻塞 I/O"的能力。关键设计决策是**循环本身保持同步**——不是让 agent loop 变成事件驱动，而只是在主循环前多了一步"检查完成的后台任务"。这种设计保持了 agent loop 的简洁性，同时获得了并行执行的好处。

通知注入就像一个"异步回调"——当后台任务完成时，结果自动出现在 agent 的下一条输入中。
