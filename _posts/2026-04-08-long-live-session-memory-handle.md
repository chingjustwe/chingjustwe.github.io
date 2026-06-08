---
layout: post
title: "LLM Agent Context & Memory Management: Problems, Solutions, and Practice"
date: 2026-04-08
categories:
  - Tech
tags:
  - LLM
  - Agent
  - Memory
  - Context Management
  - OpenClaw
  - Hermes
---

## Problem 1: Context Length Explosion

### Description

A user staying in the same session for a long time causes the conversation history to accumulate continuously, eventually exceeding the LLM's context window limit. Even before hitting the limit, an overly long context dilutes attention, degrades reasoning quality, and drives token costs through the roof.

---

### Common Industry Solutions

#### 1. Sliding Window

Directly discard the earliest messages, keeping only the last k turns.

```
[Message1][Message2]...[Message N-k]  ← discarded
                [Message N-k+1]...[Message N]  ← kept
```

**Drawback**: early important information (e.g., user background, task goals) is permanently lost.

---

#### 2. Summary Compression

Use a separate LLM call to compress the conversation history into a summary, then replace the raw history with the summary for continued conversation.

```
Raw History ──► Summarizer LLM ──► Summary + New Message
```

A common approach is **hierarchical summarization**:

```
[Summary v1: Rounds 1-20] + [Summary v2: Rounds 21-40] + [Last 10 Raw Turns]
```

---

#### 3. RAG-based Memory Retrieval

Each message is vectorized and stored in a database. When a new message arrives, relevant historical snippets are retrieved and injected into the context, enabling theoretically unlimited history capacity.

```
Each Message ──► Embedding ──► Vector DB
                                  ↑
New Message ──► Retrieve Relevant History ──┘ ──► Inject into Context
```

**Drawback**: retrieval may miss implicit connections, and the assembled context often lacks coherence.

---

#### 4. Structured Tiered Memory (Production-grade Standard)

Memory is split into three tiers, and the prompt is assembled dynamically on each request:

```
┌─────────────────────────────────────┐
│  In-Context (Working Memory)        │  ← most recent turns, directly in the prompt
├─────────────────────────────────────┤
│  External Cache                     │  ← session summary, entity state
├─────────────────────────────────────┤
│  Long-term Store                    │  ← user profile, cross-session preferences
└─────────────────────────────────────┘
```

The system prompt is assembled dynamically each time:

```
System Prompt
  = Role Definition
  + Long-term User Profile (from long-term store)
  + Session Summary (from cache)
  + Relevant History Snippets (RAG retrieval)
  + Most Recent N Raw Turns
```

---

### OpenClaw / Hermes Solutions

#### OpenClaw: Memory Flush + Dreaming

**Memory Flush** (instant loss prevention)

When a session approaches the context compression limit, a silent turn is triggered automatically, prompting the agent to persist any important facts not yet written to a file before compression runs. This provides seamless context continuation without user awareness.

**Dreaming** (background consolidation, inspired by human sleep)

Runs offline on a schedule, processing short-term memory in three phases:

```
Daily Notes + Sessions + Recall Traces
         │
    ┌────▼────┐
    │ Light   │  Ingest, deduplicate, stage, record signals
    └────┬────┘
         │
    ┌────▼────┐
    │   REM   │  Extract themes, record reinforcement signals
    └────┬────┘
         │
    ┌────▼────┐
    │  Deep   │  Score, threshold filter → promote to MEMORY.md
    └────┬────┘
         │
    DREAMS.md (human-readable review log)
```

Deep phase scoring weights:

| Signal               | Weight |
|----------------------|--------|
| Relevance            | 30%    |
| Frequency            | 24%    |
| Query diversity      | 15%    |
| Recency              | 15%    |
| Consolidation        | 10%    |
| Conceptual richness  | 6%     |

Only content that passes all three gates — score, recall frequency, and query diversity — enters long-term MEMORY.md, maintaining a high signal-to-noise ratio.

---

#### Hermes: Four-layer Memory Architecture

Hermes uses a four-layer memory architecture to address the context length problem:

| Tier    | Name                | Content                              | Scope                    |
|---------|---------------------|--------------------------------------|--------------------------|
| Short   | Episodic Memory     | Current conversation context         | Current inference window |
| Mid     | Anticipatory Memory | RAG-retrieved relevant documents     | Cross-turn, proactive    |
| Long    | Semantic Memory     | User model, factual knowledge        | Cross-session            |
| Long    | Procedural Memory   | Skill library (reusable experience)  | Cross-session            |

Anticipatory Memory is driven by flowstate-qmd, injecting relevant context into the prompt **before the user even speaks**, rather than passively waiting for a retrieval trigger.

---

## Problem 2: Topic Switching Causes Attention Fragmentation

### Description

Within the same session, the user's questions may be completely unrelated — just finished discussing code architecture, and the next message asks about travel plans. Irrelevant content piles up in the context, distracting the LLM from the current task and degrading reasoning quality.

---

### Common Industry Solutions

#### 1. Topic-aware Routing

```
New Message ──► Topic Classifier ──► Topic switch?
                              │
                     Yes ──► Switch to sub-session, clear working memory
                            Keep only user profile
                              │
                     No ──► Continue with current context
```

#### 2. Multi-agent Isolation

```
Orchestrator
    ├── Agent A: Code Assistant (independent context)
    ├── Agent B: Writing Assistant (independent context)
    └── Agent C: Data Analysis (independent context)
```

The user perceives a "single conversation," but underneath, messages are routed to different agents by topic, with no interference.

#### 3. Task-level Session Isolation

```
User sends message ──► Orchestrator determines: new task or follow-up?
    │
    ├── New Task ──► Spawn new execution session, only inherit user profile
    │
    └── Follow-up ──► Continue in current task session
```

---

### OpenClaw / Hermes Solutions

#### OpenClaw: Sub-agent Isolation + State Externalization

For long-running tasks commanded over IM, OpenClaw delegates sub-tasks to **short-lived independent sub-agents**, each with its own focused context and toolset. Once finished, they are destroyed, leaving the main agent's context untainted.

At the same time, the agent externalizes its working state to files (rather than relying on context continuity):

```markdown
# MEMORY.md (agent-maintained)
- Current task: refactor auth module
- Done: read auth.py, found JWT expiry bug
- TODO: fix line 87, run tests
- User preference: don't change function signatures
```

This file is injected into the system prompt each round, enabling cross-turn state persistence that does not depend on context continuity.

---

#### Hermes: Skill Distillation (Procedural Experience)

Hermes takes a more aggressive approach — **turning successful reasoning processes into reusable procedures, bypassing context consumption entirely**.

**Triggers** (any one suffices):
- Five or more tool calls
- Successful recovery from an error
- User corrected the agent's behavior
- A non-obvious but effective workflow

**Distillation pipeline**:

```
Raw Trajectory (successful multi-step tool call chain)
        │
   Skill Factory Analysis
        │
   ~/.hermes/skills/skill_name.md (structured instruction file)
        │
   Next time a similar problem arises → load and execute directly
   (skips the token cost of re-reasoning)
```

Hermes ships with 40+ built-in skills (covering MLOps, GitHub workflows, research, productivity, etc.). The agent continuously creates new skills during use and self-improves based on failures and user feedback.

---

## Comparison Summary

| Dimension                | Industry Common Approach         | OpenClaw                              | Hermes                                    |
|--------------------------|----------------------------------|---------------------------------------|-------------------------------------------|
| Context length control   | Sliding window, summary compress | Memory Flush + Dreaming               | Four-layer memory + anticipatory RAG      |
| Memory quality mgmt      | Structured tiered memory         | Three-phase scoring → MEMORY.md       | Honcho user modeling                      |
| Topic isolation          | Multi-agent / routing            | Sub-agent isolation                   | Task-level session                        |
| Cross-session persistence| Long-term store                  | MEMORY.md file                        | Skill library + user model                |
| Reasoning efficiency     | Prompt caching                   | State externalization (MEMORY.md)     | Skill distillation (procedural experience)|

**Core design philosophy comparison**:

- **OpenClaw**: like human sleep, uses offline consolidation to keep memory high-signal — **memory quality management**.
- **Hermes**: distills reasoning into procedures, making the agent genuinely smarter over time — **experience as code**.
- **Common ground**: both strictly separate "memory" from "context". Memory is persistent structured storage; context is a dynamically assembled prompt each round — never conflated.
