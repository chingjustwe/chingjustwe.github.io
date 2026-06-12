# s10: Team Protocols

> **格言**: *"Teammates need shared communication rules"*
> **Harness 层**: Protocols——模型之间的结构化握手

## 解决的问题

在 s09 中，队友可以工作和通信，但缺乏结构化协调：

- **Shutdown**：杀死线程会留下半写的文件和过期的 config.json。需要一次握手：lead 请求，队友批准（完成并退出）或拒绝（继续工作）。
- **Plan Approval**：当 lead 说"重构 auth 模块"时，队友立刻开始。对于高风险更改，lead 应该先审查计划。

两者共享相同的结构：一方发送带唯一 ID 的请求，另一方引用该 ID 做出响应。

## 解决方案

```
Shutdown Protocol            Plan Approval Protocol
==================           ======================

Lead             Teammate    Teammate           Lead
  |                 |           |                 |
  |--shutdown_req-->|           |--plan_req------>|
  | {req_id:"abc"}  |           | {req_id:"xyz"}  |
  |                 |           |                 |
  |<--shutdown_resp-|           |<--plan_resp-----|
  | {req_id:"abc",  |           | {req_id:"xyz",  |
  |  approve:true}  |           |  approve:true}  |
```

**共享的 FSM**（有限状态机）：
```
[pending] --approve--> [approved]
[pending] --reject---> [rejected]
```

Tracker 数据结构：
```
shutdown_requests = {req_id: {target, status}}
plan_requests     = {req_id: {from, plan, status}}
```

## 代码要点

1. **Lead 发起 shutdown**，生成 request_id 通过收件箱发送：

```python
shutdown_requests = {}

def handle_shutdown_request(teammate: str) -> str:
    req_id = str(uuid.uuid4())[:8]
    shutdown_requests[req_id] = {"target": teammate, "status": "pending"}
    BUS.send("lead", teammate, "Please shut down gracefully.",
             "shutdown_request", {"request_id": req_id})
    return f"Shutdown request {req_id} sent (status: pending)"
```

2. **队友收到请求并响应**批准/拒绝：

```python
if tool_name == "shutdown_response":
    req_id = args["request_id"]
    approve = args["approve"]
    shutdown_requests[req_id]["status"] = "approved" if approve else "rejected"
    BUS.send(sender, "lead", args.get("reason", ""),
             "shutdown_response",
             {"request_id": req_id, "approve": approve})
```

3. **Plan approval** 遵循相同的模式：

```python
plan_requests = {}

def handle_plan_review(request_id, approve, feedback=""):
    req = plan_requests[request_id]
    req["status"] = "approved" if approve else "rejected"
    BUS.send("lead", req["from"], feedback,
             "plan_approval_response",
             {"request_id": request_id, "approve": approve})
```

## 关键洞察

- **一个 FSM，两个应用场景**。同样的 `pending -> approved | rejected` 状态机处理任何请求-响应协议
- `request_id` 是**关联标识符**——它让异步通信可以配对请求和响应
- 协议是**在工具层面而非代码层面**实现的：没有硬编码的 FSM 跳转逻辑，协议状态由工具和 LLM 共同维护

## 变化总结

| 组件 | 之前 (s09) | 之后 (s10) |
|------|-----------|-----------|
| Tools | 9 | 12 (+shutdown_req/resp +plan) |
| Shutdown | 仅自然退出 | 请求-响应握手 |
| Plan gating | 无 | 提交/审查带审批 |
| 关联 | 无 | request_id 每个请求 |
| FSM | 无 | pending -> approved/rejected |

## 我的理解

s10 展示了一个重要的 harness 工程模式：**结构化通信协议**。没有协议的通信就像没有格式的对话——双方可能各说各话。`request_id` 是异步通信的基础设施，让模型可以配对请求和响应。

最优雅的是 shutdown 和 plan approval 共用同一模式——体现了"在系统中识别通用模式并提取为框架"的工程哲学。一个 FSM 驱动两个协议，而这个 FSM 本身不是在代码中硬编码，而是由模型和工具共同维持的"协议层"。
