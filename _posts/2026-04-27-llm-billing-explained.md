---
layout: post
title: "LLM Billing: What Are You Actually Paying For?"
date: 2026-04-27
categories:
  - Tech
tags:
  - LLM
  - Billing
  - AI
  - Cost
---

Without any optimization, input tokens grow linearly with each turn, and the total cost ends up roughly proportional to n squared.

In practice it is not that bad. API providers have caching, and tools do context compression. Let me walk through each piece.

## The basic fact

LLMs are stateless. They do not remember what was said in the previous turn.

So every message you send must include the entire conversation history. Tools just stitch the history together and ship it to the API in one shot.

## Running the numbers (assuming no optimization)

Assume per turn:
- The user sends 100 tokens
- The model replies with 200 tokens

| Turn | Input content | Input tokens | Input cost (at $0.14/M tokens) |
|------|-------------|-------------|-------------------------------|
| 1 | U₁ | 100 | $0.000014 |
| 2 | U₁ + R₁ + U₂ | 100+200+100=400 | $0.000056 |
| 3 | U₁ + R₁ + U₂ + R₂ + U₃ | 100+200+100+200+100=700 | $0.000098 |
| 4 | ... | 1000 | $0.000140 |
| 5 | ... | 1300 | $0.000182 |
| n | All previous turns + current | ~300n - 200 | ~(300n-200) × unit price |

The trend: input tokens per turn is roughly 300 × (n-1), growing linearly.

Cumulative cost:

```
Total cost ≈ unit price × (100 + 400 + 700 + 1000 + ...)
           = unit price × arithmetic series sum
           = unit price × (150n² - 50n)
```

For large n, roughly 150 × unit price × n².

Total cost is proportional to the square of the number of turns. Your gut feeling was right.

## But three things help in practice

### 1. KV Cache

This is the most important mechanism.

When the API processes your input, it runs every token through the neural network. Two phases:
1. Prefill: computes attention relationships between all input tokens (the heavy part)
2. Decode: generates output tokens one by one

If the first 300 tokens of turn 2 are identical to turn 1 (the conversation history), the API provider caches the intermediate results from turn 1 and reuses them in turn 2.

This means:
- Turn 2 sends 400 tokens, but only the last 100 (the new message) need recomputation
- The first 300 tokens get the cache hit price

**DeepSeek V4 Flash pricing:**
| Type | Price |
|------|-------|
| Cache miss | $0.14 / M tokens |
| Cache hit | **$0.028 / M tokens** (80% off) |

Back to the example:

| Turn | Input tokens | Cache miss | Cache hit | Actual cost |
|------|-------------|-----------|----------|------------|
| 1 | 100 | 100 | 0 | 100 × $0.14/M = $0.000014 |
| 2 | 400 | 100 (new) | 300 (history) | 100×$0.14 + 300×$0.028 = $0.0000224 |
| 3 | 700 | 100 | 600 | 100×$0.14 + 600×$0.028 = $0.0000308 |
| n | 300n-200 | ~100 | ~300n-300 | **roughly linear, no longer quadratic** |

With caching, the incremental cost per turn is basically constant (only the new input is charged at full price).

One caveat: a DeepSeek API key shares its cache globally, but only if the input prefix is character-for-character identical. Change one word and the cache misses. So if a tool truncates or rewrites history, caching does not help.

### 2. Context Compression

Tools like OpenCode have built-in context compression. When the conversation gets too long, they:
1. Summarize most of the earlier history into a digest, replacing the raw conversation
2. Keep only the most recent turns in full detail
3. Drop irrelevant tool call results

Effect:
```
Raw history: 10000 tokens → compressed: 2000 tokens
```

Same logic as taking meeting notes. You do not need every word everyone said. You just need the conclusions and the key data.

### 3. Output costs money too

So far we only looked at input, but output is also billed:
- DeepSeek V4 Flash output price: **$0.28 / M tokens** (double the input price)
- Output tokens per turn is roughly the model's reply length, it does not accumulate
- So output cost grows linearly with turns, not quadratically

## What costs look like in practice

A typical OpenCode debugging session:

| Turn | Scenario | Input tokens (with cache) | Cost |
|------|---------|------------------------|------|
| 1 | "Help me look at this bug" | 500 (full price) | ~$0.00007 |
| 2-5 | AI asks, user answers, code changes | 200-500 new per turn | ~$0.00003-0.00007/turn |
| 6 | AI finds root cause, writes fix | 800 new (output may be larger) | ~$0.0001 |
| 7-10 | AI continues checking, verifying | 200-500 new per turn | ~$0.00003-0.00007/turn |

A full debugging session (10 turns): roughly $0.0005-0.001 total.

Even with heavy use at 50 turns per day, costs are around $0.01-0.05.

## Visualization

```
Cost
  ↑                         ✦ No cache (quadratic)
  │                      ✦
  │                   ✦
  │                ✦
  │             ✦
  │          ✦
  │       ✦
  │    ✦                            --- With cache (linear)
  │ ✦                             .... Output cost (linear)
  └──────────────────────────────→ Turns
```

With caching:
- Input cost (linear): each turn adds roughly constant × cache miss price + history × cache hit price
- Output cost (linear): each turn adds roughly reply length × output price
- Total cost is roughly linear, not quadratic

## Summary

| Your intuition | True/False | Explanation |
|--------------|-----------|-------------|
| Input tokens keep piling up | True | History keeps growing |
| The input portion gets more expensive over time | True | But caching slows this down a lot |
| Total cost ≈ n² | Theoretically true | Cache hits at 80% off plus context compression make it nearly linear |
| Later turns cost more | True | But the marginal cost per turn is roughly constant |

Bottom line: do not worry about the n² problem. Caching and context compression keep actual costs close to linear. A heavy session typically costs a few cents.

## The coding agent problem: Agent loops multiply interactions

### Normal chat vs coding agent

| Dimension | Normal LLM chat | Coding agent |
|----------|---------------|-------------|
| Typical turns | 1-5 | 10-100 |
| Tokens added per turn | Hundreds | Thousands to tens of thousands (depends on file size) |
| Cost growth pattern | Linear | Steeper (every turn carries full history) |
| Unpredictability | Low | High. You do not know if fixing a bug takes 5 steps or 50 |
| Typical cost | $0.0001-0.001 | $0.01-0.1+ |

### What the agent loop looks like

Normal chat:
```
User → sends message → model replies → done
```

A coding agent fixing a bug:
```
User → "Help me look at this bug"
  ↓
AI thinks → decides which file to read
  ↓ calls read tool
Tool returns file content (500 lines of code)
  ↓
AI thinks → decides what command to run to reproduce the bug
  ↓ calls bash tool
Bash returns error output
  ↓
AI thinks → decides which line to change
  ↓ calls edit tool
  ↓
... this may repeat 10-50 times
  ↓
Final result
```

Each step is a separate LLM call. A single task can easily take 10-50 calls.

### Tool results are often large

Normal chat:
```
User sends 100 words → model replies with 200 words
Increment per turn: ~300 tokens
```

Coding agent:
```
User sends 50 words → AI calls tool to read a file
Tool returns 500 lines of code → maybe 5000 tokens
Increment this turn: 5000 tokens (10-20x normal chat)
```

Running `grep -r "keyword" ./src` might return tens of thousands of tokens. All of it feeds into the next turn's input.

### A real example

With DeepSeek V4 Flash, a 20-turn debugging task:

| Turn | Event | New input tokens | Cumulative input tokens |
|------|-------|----------------|----------------------|
| 1 | User sends prompt | 500 | 500 |
| 2 | AI reads a file | 3000 | 3500 |
| 3 | AI runs bash | 200 | 3700 |
| 4 | AI analyzes error | 500 | 4200 |
| 5 | AI reads another file | 5000 | 9200 |
| 6 | AI runs tests | 300 | 9500 |
| 7 | AI edits code | 200 | 9700 |
| ... | (repeats) | ... | ... |
| 20 | Final reply | ~500 | ~15000 |

The problem: cumulative input keeps growing because everything from previous turns gets sent again.

### Caching does not fully save coding agents

The "caching makes costs linear" story breaks down for coding agents:

```
Turn 1:  500 tokens  → full price
Turn 2:  3500 tokens → first 500 hit + last 3000 miss (full price)
Turn 3:  3700 tokens → most of first 3500 hit + last 200 miss
Turn 5:  9200 tokens → file content is huge, thousands of new miss tokens every time
```

Large chunks of new content like file contents are always cache misses. History tokens hit cache fine, but the new file content is so large that per-turn costs stay significant.

### What OpenCode does about it

| Measure | What it does | Effect |
|---------|-------------|--------|
| Selective tool result retention | Keeps only key info (error messages, line numbers), not all tool output | Reduces new tokens per turn |
| Context compression | Auto-compresses when history gets too long, keeps digest, discards raw long output | Prevents unbounded growth |
| Output truncation | Truncates long bash or grep output | Prevents injecting tens of thousands of tokens at once |

### Real cost estimates

| Task type | Turns | Typical cost (DeepSeek V4 Flash) |
|----------|-------|--------------------------------|
| Simple code completion | 3-5 | $0.001-0.005 |
| Read code + small change | 5-15 | $0.005-0.03 |
| Complex bug debugging | 15-50 | $0.03-0.15 |
| Large-scale refactoring | 50-100 | $0.15-0.5+ |

Heavy monthly use can run into tens or hundreds of dollars.

### Tips to control costs

| Method | How | Savings |
|--------|-----|---------|
| Pick a cheap model | Use DeepSeek V4 Flash instead of Claude Opus | 50-100x cheaper |
| Write clear prompts | Reduce back-and-forth trial | 30-50% fewer turns |
| Cut losses early | `/undo` when AI goes down the wrong path | Saves big |
| Set spending limits | Monthly cap in OpenCode Zen | Prevents surprises |
| Monitor token usage | Check API billing dashboard | Stay informed |

### Summary: coding agents really are much more expensive

The cost gap between normal chat and coding agents is 10-100x, and coding agent costs are unpredictable. You never know how many turns a bug fix will take.

If you use it heavily, watch your bill, set spending limits, and cut your losses early instead of pushing through a dead end.

## Appendix: Prefill and Decode explained

### Why KV cache makes cache hits possible

The core of Transformer token processing is the attention mechanism. Each token computes relationships with every token before it.

This produces two vectors per token: K (Key) and V (Value). After computation, the server stores each token's K and V, which is the KV cache.

### Prefill phase: process all input

When you send text to the API, say 500 tokens:

```
500 tokens need pairwise attention computation
That is 500 × 500 = 250,000 calculations

After each token is computed, its K and V go into the cache

All 500 tokens are computed in one shot. This is Prefill.
```

The cost of Prefill is baked into the "input token" price. Your payment covers those 250,000 calculations.

### Decode phase: generate output token by token

The model starts generating text:

```
Generating the 1st output token:
- Its K and V must be computed fresh
- It attends to the 500 cached K vectors from Prefill (reusing cache)
- Much cheaper than Prefill

Generating the 2nd output token:
- Now the cache has the 1st token's K and V too
- It attends to the 500 Prefill K vectors + the 1st token's K
- Each new token reuses all previously cached tokens

This token-by-token generation is Decode.
```

### How caching affects your bill

KV Cache saves server compute. For your bill:

```
Your bill =
  Input tokens × input price (Prefill covers all input)
+ Output tokens × output price (Decode generates one by one)

KV Cache does not change the price tags you see.
It lowers DeepSeek's compute costs, so DeepSeek can offer lower prices.
```

DeepSeek's cache hit price is 1/5 of the miss price ($0.028 vs $0.14). That is how they pass the compute savings on to you.
