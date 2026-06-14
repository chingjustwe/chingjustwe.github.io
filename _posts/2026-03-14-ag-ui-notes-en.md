---
layout: post
title: "AG-UI (Agent–User Interaction Protocol) Notes"
date: 2026-03-14
categories:
  - Tech
tags:
  - AG-UI
  - Agent
  - Protocol
---

# AG-UI (Agent–User Interaction Protocol) Notes

## Why AG-UI?

The first time someone comes across AG-UI, they usually ask:

> We already have SSE / WebSocket. Why do we need AG-UI?

Here's the distinction:

- SSE/WebSocket solve **how to transmit (Transport)**
- AG-UI solves **what to transmit (Interaction Protocol)**

Analogy:

| Layer | Role |
|--------|--------|
| TCP | Transmits byte streams |
| HTTP | Defines request/response semantics |
| SSE | Defines server-push streaming |
| AG-UI | Defines Agent–UI interaction event semantics |

---

## Limitations of SSE

SSE only sends events:

```text
event: message
data: hello
```

But it doesn't know:

```text
Is this plain text?
Is this a Tool Call?
Is this an approval request?
Is this a state sync?
```

To SSE, it's all just strings.

That's why different Agent Frameworks end up defining their own event formats.

For example:

LangGraph:

```json
{
  "type": "tool_start"
}
```

Another framework:

```json
{
  "event": "tool.begin"
}
```

The frontend has to adapt to each one.

---

## The Core Value of AG-UI

AG-UI defines a unified event model:

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

No matter the backend:

- LangGraph
- OpenAI Agents SDK
- CrewAI
- PydanticAI
- Custom Agent

The frontend sees the same events.

---

## How AG-UI Relates to MCP and A2A

### MCP

Solves:

```text
Agent ↔ Tool
```

For example:

```text
GitHub
Jira
Slack
MySQL
```

### A2A

Solves:

```text
Agent ↔ Agent
```

For example:

```text
Research Agent
    ↓
Coding Agent
    ↓
Review Agent
```

### AG-UI

Solves:

```text
Agent ↔ UI
```

For example:

```text
React
Vue
Mobile App
Desktop App
```

---

## Who Are the Two Parties in AG-UI Communication?

Many sources describe it as:

```text
User ↔ Agent
```

But a more accurate framing is:

```text
Agent Runtime ↔ Agent Client
```

Or:

```text
Agent Backend ↔ Agent Frontend
```

Common scenarios:

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

## Putting AG-UI Into Practice

### Frontend

#### Without AG-UI

React listens to SSE directly:

```javascript
const es = new EventSource("/agent");
```

Then parses whatever custom events the backend sends.

Downside:

Every Agent Framework needs its own adapter.

---

#### With AG-UI

The frontend only deals with standard events:

```text
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT
TEXT_MESSAGE_END

TOOL_CALL_START
TOOL_CALL_END

STATE_DELTA
```

For example:

```typescript
client.subscribe(event => {
  switch(event.type) {
    case "TOOL_CALL_START":
      showTool(event.toolName)
      break
  }
})
```

Switching the Agent Runtime doesn't require frontend changes.

---

### Backend

#### LangGraph

Native events:

```text
on_tool_start
on_tool_end
on_llm_new_token
```

Transformation:

```text
LangGraph Event
      ↓
 AG-UI Event
```

For example:

```text
on_tool_start
      ↓
TOOL_CALL_START
```

---

#### LangChain

Using a Callback Handler:

```python
class AgUiHandler(BaseCallbackHandler):
    ...
```

Mapping:

```text
on_tool_start
      ↓
TOOL_CALL_START

on_llm_new_token
      ↓
TEXT_MESSAGE_CONTENT
```

---

#### OpenCode

OpenCode has its own event system:

```text
task_start
tool_start
tool_end
message_chunk
```

Integration:

```text
OpenCode Event
      ↓
 AG-UI Adapter
      ↓
React/Vue/UI
```

---

## What Actually Makes AG-UI Valuable

A lot of people think it's just about token streaming.

Turns out streaming is the easy part.

What's actually valuable:

### Human In The Loop

Agent:

```text
About to delete the production database
```

Sends:

```json
{
  "type": "APPROVAL_REQUEST"  // actual AG-UI uses the interrupt mechanism; this is a simplified illustration
}
```

Frontend automatically shows:

```text
Approve
Reject
```

After the user chooses, execution continues.

---

### Shared State

Agent:

```json
{
  "type": "STATE_DELTA"
}
```

Updates the shared state.

React/Vue sync the UI automatically.

---

### Generative UI

Agent outputs:

```json
{
  "type": "UI_COMPONENT", // actual AG-UI implements this through tool calls + state; this is a conceptual illustration
  "component": "table"
}
```

Frontend renders automatically:

```text
Table
Chart
Form
Card
```

---

## Architect's Perspective

If the system is just:

```text
React
   ↓
Agent
```

Then SSE is enough.

But if the goal is:

```text
Support LangGraph
Support ADK
Support OpenAI Agents
Support OpenCode
Support custom Agents
```

And also:

```text
Web
Mobile
Desktop
```

That's where AG-UI's value shows up.

Unified as:

```text
Agent Adapter
      ↓
    AG-UI
      ↓
 Unified UI
```

---

## TL;DR

```text
MCP = The USB port for Agents

A2A = The RPC protocol for Agents

AG-UI = The frontend protocol for Agents
```

Or:

```text
SSE = The delivery company

AG-UI = The standardized packaging inside the box
```

You can get by without AG-UI.

AG-UI's goal is to standardize the connection between different Agent Frameworks and different frontend frameworks.
