---
layout: post
title: "LangChain vs LangGraph vs DeepAgents vs OpenCode: A Framework Comparison and DeepAgents Architecture Deep Dive"
date: 2026-01-08
categories:
  - Tech
tags:
  - LangChain
  - LangGraph
  - DeepAgents
  - OpenCode
  - Agent
  - LLM
---

I recently went through the major Agent frameworks on the market. LangChain, LangGraph, DeepAgents, and OpenCode each have their own role, but put them together and it's easy to get confused. This article gives you a side-by-side comparison, then dives into DeepAgents' internals.

## 1. At a Glance

| Project | Type | Core Role |
|---------|------|-----------|
| LangChain | Framework | LLM application framework |
| LangGraph | Runtime | Agent orchestration and execution runtime |
| DeepAgents | Harness | Pre-built Agent OS-level execution environment |
| OpenCode | Runtime (System-level) | Execution sandbox and tool runtime for coding agents |

## 2. Key Differences

| Dimension | LangChain | LangGraph | DeepAgents | OpenCode |
|-----------|-----------|-----------|------------|----------|
| Abstraction level | Low-level tool wrappers | State machine / graph orchestration | Agent OS (high-level encapsulation) | System-level execution environment |
| How you use it | Write chains/agents manually | Define a graph | Use agent presets directly | Run an agent directly |
| Control model | Developer has full control | Developer defines the flow | Constraints + automatic scheduling | Runtime executes automatically |
| Complexity | Medium | High | Low | Medium |
| Customizability | Very high | Very high | Medium | Medium |
| Target user | Developers | Agent architects | Agent users | Coding agent users |

## 3. Design Philosophy

### 3.1 LangChain (Framework)

- Provides basic abstractions (LLM / Tool / Memory)
- Doesn't care about execution structure
- Everything is composed by the developer

Essentially: a toolbox.

### 3.2 LangGraph (Runtime)

- Uses a "graph" to define agent execution flow
- Supports loops, branches, and state management
- Good for complex workflows

Essentially: a programmable execution graph.

### 3.3 DeepAgents (Harness)

Turns an agent into an OS-level execution environment. It provides:

- Task decomposition (task / todo system)
- Sub-agents (subprocess model)
- Filesystem as memory (external state)
- Automatic context management
- Permission and security controls
- Long-running execution

Essentially: an Agent OS.

### 3.4 OpenCode (Runtime)

Lets agents safely operate in a real computing environment. It provides:

- Shell execution
- Git / repo operations
- Filesystem access
- Sandbox isolation
- MCP / tool runtime
- Long-running task support

Essentially: a Coding Agent operating system.

## 4. Execution Model Comparison

### LangChain
```
LLM -> Tool -> LLM -> Tool
```

Technically, LangChain's `create_agent` also runs this loop under the hood, but developers don't control the loop logic directly. LCEL chains are linear compositions, while the ReAct loop is hidden inside the agent.

### LangGraph
```
Node A -> Node B -> Node C
   ^         |
   +---------+
```

LangGraph exposes loops, branches, and state transitions as programmable nodes. You decide when the model should retry, which branch to take, and how to merge results. All of it is controllable on the graph.

### DeepAgents
```
Agent
 +-- Planner (todo system)
 +-- SubAgent (isolated workers)
 +-- File System (external memory)
 +-- Tool Runtime
 +-- Context Manager
```

The Agent OS perspective: an agent contains a planner, sub-agents, a filesystem, a tool runtime, and a context manager. Each component does its job, forming a complete execution environment.

### OpenCode
```
Agent
 +-- Sandbox Runtime
 +-- File System
 +-- Shell / Git
 +-- MCP Tools
 +-- Permission Layer
```

More system-level: it wraps the computing environment into a secure sandbox, letting agents run shell commands, manipulate files, and manage repos, all under a permission layer.

## 5. DeepAgents: Under the Hood

That covers the external comparison. Now let's look inside DeepAgents and see what a `create_deep_agent` call actually does.

### What Happens Inside create_deep_agent

When you write `agent = create_deep_agent(model=..., tools=[...])`, it assembles an entire LangGraph under the hood. Here's the internal structure I traced from the source code:

```
+---------------------------------------------------------------+
|  create_deep_agent (deepagents)                                |
|                                                                |
|  1. Parse model / tools / subagents / permissions ...           |
|  2. Assemble middleware stack (approximate order;              |
|     actual order may vary by version):                         |
|      +- TodoListMiddleware        (write_todos / read_todos)    |
|      +- SkillsMiddleware          (optional, skill files)      |
|      +- FilesystemMiddleware      (ls/read/write/edit/glob/grep)|
|      +- SubAgentMiddleware        (task tool -> sub-agent)     |
|      +- SummarizationMiddleware   (context compression)        |
|      +- PatchToolCallsMiddleware  (tool call correction)       |
|      +- User Middleware           (your custom middleware)      |
|      +- MemoryMiddleware          (optional, AGENTS.md)        |
|      +- HumanInTheLoopMiddleware  (optional, interrupt_on)     |
|                                                                |
|  3. Call create_agent(...) -> build LangGraph StateGraph        |
+----------------------------+----------------------------------+
                             |
                             v
+---------------------------------------------------------------+
|  create_agent (langchain.agents)                               |
|                                                                |
|  graph = StateGraph(AgentState)                                |
|                                                                |
|  Nodes:                                                        |
|    model  -- LLM call node (your ChatOpenAI / ChatAnthropic)   |
|    tools  -- ToolNode (executes all tool calls)                |
|    *.before_model / *.after_model  -- middleware hooks         |
|    *.before_tools / *.after_tools  -- middleware hooks         |
|                                                                |
|  Edges (the ReAct loop):                                       |
|    START ----------------------> entry_node                   |
|    model -> tools  (when tool_calls exist)                     |
|    model -> exit   (when no tool_calls)                        |
|    tools -> model  (loop back to LLM)                          |
|    model -> *.after_model  (middleware processing)            |
|    loop_exit_node -> exit_node                                 |
|                                                                |
|  return graph.compile() -> CompiledStateGraph                  |
+---------------------------------------------------------------+
```

### Key Takeaways

| What you see | What's hidden |
|---|---|
| `create_deep_agent(model=..., tools=[...])` | Internally constructs a complete LangGraph StateGraph |
| `agent.invoke({"messages": [...]})` | Runs repeatedly through the graph: model -> tools -> model -> tools -> ... |
| You passed only 2 custom tools | The framework auto-injects write_todos / ls / read_file / write_file / execute / task (10+ tools total) |
| `tools=[get_current_time, search_files]` | These get merged into the same ToolNode as the built-in tools |
| Looks like a single call | May loop internally multiple times (LLM -> call tool -> feed result back -> call tool again -> ...) |

### What "Harness" Actually Means

"Harness" is not a single class. It's the entire infrastructure layer:

- **Graph structure**: StateGraph + nodes + edges (state passing, loop control)
- **Middleware stack**: each middleware injects behavior before and after model calls and tool execution (filesystem, summarization, memory, etc.)
- **Built-in tools**: planning / filesystem / execution / task delegation
- **Profile system**: automatically selects optimized system prompts and tool descriptions per model (e.g., a dedicated Claude profile)
- **Subagent management**: context isolation, tool inheritance, state isolation

You can customize this behavior through `HarnessProfile`, but the defaults work out of the box.

### How to Verify

```python
agent = create_deep_agent(model=model, tools=[...])

print(type(agent))
# <class 'langgraph.graph.state.CompiledStateGraph'>

print(agent.get_graph().draw_ascii())

# List all registered tools
print([t.name for t in agent.tools])

agent.invoke({"messages": [...]}, debug=True)
```

I ran this myself, and `get_graph().draw_ascii()` gives you a visual of the full graph structure. Really handy for debugging.

## 6. How They Relate

These aren't alternatives. They're layers:

```
LangChain (foundation)
   |
LangGraph (orchestration)
   |
DeepAgents (Agent OS layer)
   |
OpenCode (system-level runtime)
```

LangChain gives you building blocks. LangGraph helps you arrange them. DeepAgents hands you a working operating system. OpenCode adds a secure server room for that OS.

## 7. How to Choose

### Quick Reference by Scenario

| Scenario | Recommendation |
|----------|---------------|
| Simple chain calls | LangChain LCEL |
| Custom graph orchestration, state machines | LangGraph |
| Complex agent out of the box | DeepAgents |
| Agent without filesystem / sub-agents | LangChain create_agent |
| Custom graph as a sub-agent | LangGraph graph -> wrap into DeepAgents |

### Per-Project Guide

**Pick LangChain when**
- Building basic LLM applications
- Doing prompt / tool chaining
- You need maximum customizability

**Pick LangGraph when**
- Building complex agent workflows
- Doing enterprise-level process orchestration
- You need fine-grained control over execution flow

**Pick DeepAgents when**
- You want a production-ready autonomous agent fast
- Building coding / research agents
- Running long-lived agent tasks
- You don't want to build the infrastructure yourself

**Pick OpenCode when**
- You need a coding agent runtime
- Doing repo operations / automated dev systems
- You need a sandbox execution environment

To be honest, these projects aren't mutually exclusive. My current setup uses LangGraph for core orchestration, DeepAgents for the pre-built infrastructure, and runs inside OpenCode's sandbox. The layers are all done by someone else; I just write the business logic.
