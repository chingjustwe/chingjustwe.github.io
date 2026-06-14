---
layout: post
title: "AG-UI（Agent–User Interaction Protocol）学习笔记"
date: 2026-06-14
categories:
  - Tech
tags:
  - AG-UI
  - Agent
  - Protocol
---

# AG-UI（Agent–User Interaction Protocol）学习笔记

## 为什么会有 AG-UI？

很多人第一次接触 AG-UI 时都会问：

> 已经有 SSE / WebSocket 了，为什么还需要 AG-UI？

答案：

- SSE/WebSocket 解决的是 **怎么传（Transport）**
- AG-UI 解决的是 **传什么（Interaction Protocol）**

类比：

| 层次 | 作用 |
|--------|--------|
| TCP | 传输字节流 |
| HTTP | 定义请求响应语义 |
| SSE | 定义服务端持续推送 |
| AG-UI | 定义 Agent 与 UI 的交互事件语义 |

---

## SSE 的局限

SSE 只负责发送事件：

```text
event: message
data: hello
```

但它不知道：

```text
这是普通文本？
这是 Tool Call？
这是审批请求？
这是状态同步？
```

对于 SSE 来说都是字符串。

因此不同 Agent Framework 往往会定义自己的事件格式。

例如：

LangGraph：

```json
{
  "type": "tool_start"
}
```

另一个框架：

```json
{
  "event": "tool.begin"
}
```

前端需要分别适配。

---

## AG-UI 的核心价值

AG-UI 定义统一事件模型：

```json
{
  "type": "TOOL_CALL_START"
}
```

```json
{
  "type": "TEXT_MESSAGE_CONTENT"
}
```

```json
{
  "type": "STATE_DELTA"
}
```

无论后端是：

- LangGraph
- OpenAI Agents SDK
- CrewAI
- PydanticAI
- 自研 Agent

前端看到的都是统一事件。

---

## AG-UI 与 MCP、A2A 的关系

### MCP

解决：

```text
Agent ↔ Tool
```

例如：

```text
GitHub
Jira
Slack
MySQL
```

### A2A

解决：

```text
Agent ↔ Agent
```

例如：

```text
Research Agent
    ↓
Coding Agent
    ↓
Review Agent
```

### AG-UI

解决：

```text
Agent ↔ UI
```

例如：

```text
React
Vue
Mobile App
Desktop App
```

---

## ChatGPT 当前使用的是 AG-UI 吗？

无法确认。

公开资料中 OpenAI 并未宣布 ChatGPT Web UI 使用 AG-UI。

更可能是：

```text
Browser
   ↓
OpenAI Internal Protocol
   ↓
ChatGPT Backend
```

ChatGPT 很多能力早于 AG-UI 出现。

因此：

> ChatGPT 不需要 AG-UI 才能实现这些功能。

---

## AG-UI 的通信双方是谁？

很多资料写：

```text
User ↔ Agent
```

实际上更准确的是：

```text
Agent Runtime ↔ Agent Client
```

或者：

```text
Agent Backend ↔ Agent Frontend
```

典型场景：

### Web

```text
React/Vue
      ↕
    AG-UI
      ↕
 Agent Runtime
```

### Mobile

```text
iOS/Android
      ↕
    AG-UI
      ↕
 Agent Runtime
```

### Desktop

```text
Electron/Tauri
       ↕
     AG-UI
       ↕
  Agent Runtime
```

---

## AG-UI 如何落地

## 前端

### 不使用 AG-UI

React 直接监听 SSE：

```javascript
const es = new EventSource("/agent");
```

然后解析各种后端自定义事件。

缺点：

每种 Agent Framework 都需要适配。

---

### 使用 AG-UI

前端只认识标准事件：

```text
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT
TEXT_MESSAGE_END

TOOL_CALL_START
TOOL_CALL_END

STATE_DELTA
```

例如：

```typescript
client.subscribe(event => {
  switch(event.type) {
    case "TOOL_CALL_START":
      showTool(event.toolName)
      break
  }
})
```

更换 Agent Runtime 时无需修改前端逻辑。

---

## 后端

### LangGraph

原生事件：

```text
on_tool_start
on_tool_end
on_llm_new_token
```

转换：

```text
LangGraph Event
      ↓
 AG-UI Event
```

例如：

```text
on_tool_start
      ↓
TOOL_CALL_START
```

---

### LangChain

利用 Callback Handler：

```python
class AgUiHandler(BaseCallbackHandler):
    ...
```

映射：

```text
on_tool_start
      ↓
TOOL_CALL_START

on_llm_new_token
      ↓
TEXT_MESSAGE_CONTENT
```

---

### OpenCode

OpenCode 本身有自己的事件系统：

```text
task_start
tool_start
tool_end
message_chunk
```

接入方式：

```text
OpenCode Event
      ↓
 AG-UI Adapter
      ↓
React/Vue/UI
```

---

## AG-UI 真正有价值的部分

很多人以为只是 Token Streaming。

其实 Streaming 最简单。

真正有价值的是：

## Human In The Loop

Agent：

```text
准备删除生产数据库
```

发送：

```json
{
  "type": "APPROVAL_REQUEST"  // 实际 AG-UI 通过 interrupt 机制实现，此处为简化示意
}
```

前端自动展示：

```text
Approve
Reject
```

用户选择后继续执行。

---

## Shared State

Agent：

```json
{
  "type": "STATE_DELTA"
}
```

更新共享状态。

React/Vue 自动同步界面。

---

## Generative UI

Agent 输出：

```json
{
  "type": "UI_COMPONENT", // 实际 AG-UI 通过 tool call + state 实现，此处为概念示意
  "component": "table"
}
```

前端自动渲染：

```text
Table
Chart
Form
Card
```

---

## 架构师视角

如果系统只有：

```text
React
   ↓
Agent
```

直接使用 SSE 就足够。

但是如果目标是：

```text
支持 LangGraph
支持 ADK
支持 OpenAI Agents
支持 OpenCode
支持自研 Agent
```

同时还要支持：

```text
Web
Mobile
Desktop
```

那么 AG-UI 的价值就会体现出来。

统一为：

```text
Agent Adapter
      ↓
    AG-UI
      ↓
 Unified UI
```

---

## 一句话总结

```text
MCP = Agent 的 USB 接口

A2A = Agent 的 RPC 协议

AG-UI = Agent 的前端协议
```

或者：

```text
SSE = 快递公司

AG-UI = 快递箱里的标准包装规范
```

没有 AG-UI 也能工作；

AG-UI 的目标是让不同 Agent Framework 与不同前端框架之间实现标准化对接。
