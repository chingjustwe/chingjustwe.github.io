# s07: Task System

> **格言**: *"Break big goals into small tasks, order them, persist to disk"*
> **Harness 层**: Persistent Tasks——比任何单次对话活得更久的目标

## 解决的问题

s03 的 TodoManager 是内存中的平面清单：没有排序、没有依赖、状态只有完成/未完成。
真实的目标是有结构的——任务 B 依赖任务 A，任务 C 和 D 可以并行，任务 E 等待 C 和 D 都完成。

没有明确的关系，agent 无法知道什么准备好了、什么被阻塞了、什么可以并发运行。而且因为列表只存在于内存，上下文压缩（s06）会把它清空。

## 解决方案

把清单提升为持久化到磁盘的**任务图**。每个任务是一个带有状态和依赖（`blockedBy`）的 JSON 文件。图在任何时刻回答三个问题：

- **什么准备好了？**——`pending` 状态且 `blockedBy` 为空的任务
- **什么被阻塞了？**——等待未完成依赖的任务
- **什么完成了？**——`completed` 状态的任务，其完成自动解除依赖者的阻塞

```
.tasks/
  task_1.json  {"id":1, "status":"completed"}
  task_2.json  {"id":2, "blockedBy":[1], "status":"pending"}
  task_3.json  {"id":3, "blockedBy":[1], "status":"pending"}
  task_4.json  {"id":4, "blockedBy":[2,3], "status":"pending"}

DAG:
                  +----------+
             +--> | task 2   | --+
             |    | pending  |   |
+----------+     +----------+    +--> +----------+
| task 1   |                          | task 4   |
| completed| --> +----------+    +--> | blocked  |
+----------+     | task 3   | --+     +----------+
                 | pending  |
                 +----------+
```

这个任务图成为 s07 之后一切（背景执行 s08、多 agent 团队 s09+、worktree 隔离 s12）的协调骨干。

## 代码要点

1. **TaskManager**：每个任务一个 JSON 文件，带依赖图的 CRUD：

```python
class TaskManager:
    def create(self, subject, description=""):
        task = {"id": self._next_id, "subject": subject,
                "status": "pending", "blockedBy": [],
                "owner": ""}
        self._save(task)
        self._next_id += 1
        return json.dumps(task, indent=2)
```

2. **依赖解析**：完成一个任务会从其他任务的 `blockedBy` 列表中清除该 ID，自动解除依赖者的阻塞：

```python
def _clear_dependency(self, completed_id):
    for f in self.dir.glob("task_*.json"):
        task = json.loads(f.read_text())
        if completed_id in task.get("blockedBy", []):
            task["blockedBy"].remove(completed_id)
            self._save(task)
```

3. **四个任务工具**进入 dispatch map：

```python
TOOL_HANDLERS = {
    "task_create": lambda **kw: TASKS.create(kw["subject"]),
    "task_update": lambda **kw: TASKS.update(kw["task_id"], kw.get("status")),
    "task_list":   lambda **kw: TASKS.list_all(),
    "task_get":    lambda **kw: TASKS.get(kw["task_id"]),
}
```

## 关键洞察

- **文件即数据库**——没有 SQL、没有 Redis，只是 JSON 文件。任务系统从磁盘恢复，不依赖对话历史
- 依赖图不仅让 agent 自己理解任务结构，也**为多 agent 协作打下基础**（s09+ 中的任务认领、工作分配都依赖这个图）
- `blockedBy` 的自动清理是**状态传播**的一种简单形式

## 变化总结

| 组件 | 之前 (s06) | 之后 (s07) |
|------|-----------|-----------|
| Tools | 5 | 8 (+task_create/update/list/get) |
| 规划模型 | 平面清单（内存中） | 带依赖的任务图（磁盘上）|
| 关系 | 无 | `blockedBy` 边 |
| 状态跟踪 | 完成或未完成 | pending -> in_progress -> completed |
| 持久性 | 压缩后丢失 | 扛住压缩和重启 |

## 我的理解

s07 是从"一次性会话"到"持久化工作系统"的转折点。任务图是文件化的 DAG（有向无环图），让 agent 的工作有了**结构**和**持久性**。整个 s09-s12 的多 agent 协作、工作隔离都建立在这个基础上。

注意和 s03 的 TodoWrite 的区别：TodoWrite 是"短期计划本"，s07 的 Task System 是"永久任务看板"。两者共存——Todo 用于单次会话清单，Task 用于跨越多次会话的项目管理。
