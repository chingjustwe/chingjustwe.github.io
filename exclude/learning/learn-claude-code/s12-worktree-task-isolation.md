# s12: Worktree + Task Isolation

> **格言**: *"Each works in its own directory, no interference"*
> **Harness 层**: Directory Isolation——永不碰撞的并行执行通道

## 解决的问题

到 s11，agent 可以自主认领和完成任务。但每个任务运行在**同一个共享目录**中。两个 agent 同时重构不同模块时会碰撞：agent A 编辑 `config.py`，agent B 编辑 `config.py`，unstaged 更改混淆，两者都无法干净回滚。

任务看板跟踪*做什么*，但对*在哪里做*没有意见。解决方案：给每个任务自己的 git worktree 目录。任务管理目标，worktree 管理执行上下文。通过任务 ID 绑定。

## 解决方案

```
Control plane (.tasks/)             Execution plane (.worktrees/)
+------------------+                +------------------------+
| task_1.json      |                | auth-refactor/         |
|   status: in_progress  <------>   branch: wt/auth-refactor
|   worktree: "auth-refactor"   |   task_id: 1             |
+------------------+                +------------------------+
| task_2.json      |                | ui-login/              |
|   status: pending    <------>     branch: wt/ui-login
|   worktree: "ui-login"       |   task_id: 2             |
+------------------+                +------------------------+
                                    |
                          index.json (worktree registry)
                          events.jsonl (lifecycle log)

State machines:
  Task:     pending -> in_progress -> completed
  Worktree: absent  -> active      -> removed | kept
```

## 代码要点

1. **创建任务**。先把目标持久化：

```python
TASKS.create("Implement auth refactor")
# -> .tasks/task_1.json  status=pending  worktree=""
```

2. **创建 worktree 并绑定到任务**。传入 `task_id` 自动将任务推进到 `in_progress`：

```python
WORKTREES.create("auth-refactor", task_id=1)
# -> git worktree add -b wt/auth-refactor .worktrees/auth-refactor HEAD
# -> index.json gets new entry, task_1.json gets worktree="auth-refactor"
```

绑定写入两侧状态：

```python
def bind_worktree(self, task_id, worktree):
    task = self._load(task_id)
    task["worktree"] = worktree
    if task["status"] == "pending":
        task["status"] = "in_progress"
    self._save(task)
```

3. **在 worktree 中运行命令**。`cwd` 指向隔离的目录：

```python
subprocess.run(command, shell=True, cwd=worktree_path,
               capture_output=True, text=True, timeout=300)
```

4. **关闭**。两个选择：
   - `worktree_keep(name)` — 保留目录供以后使用
   - `worktree_remove(name, complete_task=True)` — 删除目录，完成绑定的任务，发出事件

```python
def remove(self, name, force=False, complete_task=False):
    self._run_git(["worktree", "remove", wt["path"]])
    if complete_task and wt.get("task_id") is not None:
        self.tasks.update(wt["task_id"], status="completed")
        self.tasks.unbind_worktree(wt["task_id"])
        self.events.emit("task.completed", ...)
```

5. **事件流**。每个生命周期步骤发出到 `.worktrees/events.jsonl`：

```json
{"event":"worktree.remove.after","task":{"id":1,"status":"completed"},
 "worktree":{"name":"auth-refactor","status":"removed"},"ts":1730000000}
```

崩溃后，状态从 `.tasks/` + `.worktrees/index.json` 在磁盘上重建。对话内存是易失的；文件状态是持久的。

## 关键洞察

- **git worktree 提供了天然的文件系统隔离**——每个 worktree 是一个独立的 git 分支和工作目录
- 双向绑定（任务知道 worktree，worktree 知道任务）使得从任何一侧都能恢复状态
- 事件流提供了**可审计的生命周期跟踪**
- 这是 s07-s11 所有机制的**最高整合**：任务（s07）+ 背景执行（s08）+ 队友（s09）+ 协议（s10）+ 自主（s11）+ 隔离（s12）

## 变化总结

| 组件 | 之前 (s11) | 之后 (s12) |
|------|-----------|-----------|
| 协调 | 任务看板（owner/status）| 任务看板 + 显式 worktree 绑定 |
| 执行范围 | 共享目录 | 任务隔离的独立目录 |
| 可恢复性 | 仅任务状态 | 任务状态 + worktree 索引 |
| 生命周期清理 | 任务完成 | 任务完成 + 显式 keep/remove |
| 生命周期可见性 | 日志中隐含 | `.worktrees/events.jsonl` 中的显式事件 |

## 我的理解

s12 是整个课程的**最高点**——它不仅解决了并行执行时文件冲突的实际问题，更重要的是展示了"关注点分离"（Separation of Concerns）原则在 harness 工程中的体现：
- **任务**管目标（做什么）
- **Worktree**管位置（在哪里做）
- 通过 ID 绑定，两者各司其职

git worktree 的选择很聪明——不需要自己实现文件系统隔离，直接利用 git 已有的功能。这也是"Bash is all you need"哲学的终极体现：用现有的操作系统原语解决问题。

事件流（events.jsonl）是一个轻量级的审计日志——让外部系统可以观察 worktree 的生命周期变化。
