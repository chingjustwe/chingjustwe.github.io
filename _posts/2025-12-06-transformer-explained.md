---
layout: post
title: "Transformer Explained: A Plain Introduction"
date: 2025-12-06
categories:
  - Tech
tags:
  - Transformer
  - LLM
  - AI
  - Deep Learning
---

> This article explains Transformer fundamentals for readers with no AI background. Some simplifications are made for clarity.

## Why Transformer Matters

In 2017, Google published "Attention Is All You Need" and introduced the Transformer. The architecture took over AI almost overnight. Translation, writing, code, conversation, image generation. They all run on Transformers.

It is the engine behind GPT, Claude, DeepSeek, and every other large model. Understanding it means understanding how AI "generates" text.

## The Core Analogy: Reading Comprehension

Imagine you read a long article and a teacher asks:

> "Based on this article, what is most likely to happen next?"

Your thought process:

```
Step 1: Review the article
  → The story: a hiker is lost in the woods, getting colder

Step 2: Infer from context
  → Cold + lost = probably build a fire or find shelter

Step 3: Output your guess
  → You write the first word: "So..."
```

When a Transformer "generates text," it does the exact same thing. It is not creating from nothing. It is predicting the most likely next word given the history.

## Q, K, V Explained Simply

Each token (word) produces three vectors:

| Vector | Name | Analogy | What it does |
|--------|------|---------|-------------|
| **Q** (Query) | Question | The question each person holds | "What do I want to know?" |
| **K** (Key) | Index card | A library catalog card | "What information do I have?" |
| **V** (Value) | Book content | The book itself on the shelf | "What is my actual content?" |

### Attention in plain language

Attention is the Transformer's core mechanism. In plain language:

```
Each token holds up its Q (question) and asks every other token's K (index card):
"Who among you has information relevant to what I'm looking for?"

Then it takes a weighted average of the V (content) values, weighted by relevance.
```

Example: processing the sentence "I like eating apples"

```
"eating" holds up its Q and asks: "Who is the subject?"
→ "I"'s K matches strongly → "I"'s V gets high weight
→ "eating" understands the context: "Oh, the subject is 'I'"

"apples" holds up its Q and asks: "What fruit came before me?"
→ "eating"'s K matches → its V gets weight
→ "apples" understands: "Oh, I complete the action 'eating'"
```

This is how Transformer "understands context." Every position can see every other position through QKV interaction.

## The Two Phases: Prefill and Decode

When you send text to an AI, it processes it in two phases:

### Phase 1: Prefill (process all input)

**What it does**: Processes the entire input in one go.

```
You send 500 tokens

500 tokens need pairwise attention
= 500 × 500 = 250,000 calculations

After each token is computed, its K and V go into the cache.
This "compute everything in parallel and cache it" process is Prefill.
```

Prefill accomplishes two things:
1. **Understands the entire input context** -- every token knows its position and relationship to every other token
2. **Stores every token's K and V in cache** -- ready for generation

**Cost**: Prefill is charged as "input tokens × unit price." Your payment covers this computation.

### Phase 2: Decode (generate output one by one)

**What it does**: The AI starts "writing," one word at a time.

```
Generating the 1st word:
  → Use special token [BOS] (Begin Of Sequence) as input
  → [BOS] computes its own Q, queries all cached K from Prefill
  → Combines all historical V values into a "context vector"
  → Feed-forward network computes probability distribution
  → Sample the 1st word, e.g. "So"

Generating the 2nd word:
  → History = original input + "So"
  → "So" computes its Q, queries all K (including its own)
  → New context vector
  → Feed-forward network computes probabilities
  → Sample the 2nd word, e.g. "he"

Generating the 3rd word:
  → Same pattern, "he"'s Q queries the entire history
  → ...
  → Repeat until a complete sentence is formed
```

**Key insight**: Every time it generates a new token, it looks back at the entire history (all K and V cached from Prefill) and predicts the most likely next word.

**Cost**: Each generated token is one Decode step. Total output tokens × unit price = output cost.

## KV Cache: Why It Saves Compute

### Without KV Cache

Every time a new token is generated, if the model had to recompute all QKV for the entire history, generating 100 words would mean computing the history 100 times. Compute would explode.

### With KV Cache

Prefill already computed all K and V. During Decode:

```
A new token only needs to:
  1. Compute its own Q, K, V (a handful of operations)
  2. Query the entire cached history of K using its Q (direct lookup, no recompute)
  3. Take a weighted average of the cached V values (direct lookup, no recompute)

Each step only computes QKV for 1 new token, not N tokens
```

**Only K and V are cached. Q is recomputed every time.**

### Effect in multi-turn conversations

```
Turn 1: 500 tokens input
  → Prefill: compute QKV for all 500 tokens, store in cache
  → Pay 500 tokens input cost

Turn 2: new message added
  → Prefill: compute QKV for new tokens only, add to cache
  → History's 500 tokens don't recompute, cache reused directly
  → Pay 500 history tokens (cache price) + N new tokens (full price)

Turn 3: same pattern
  → Pay history tokens (cache price) + N new tokens (full price)
  → And so on
```

**DeepSeek pricing**:
- Cache Miss (full price): $0.14 / M tokens
- Cache Hit (cache price): $0.028 / M tokens (80% off)

## Full Flow: One Conversation End to End

```
You input text (e.g. "write an add function")

↓

[Prefill Phase]
Tokenize the text
→ Each token computes Q, K, V
→ Pairwise attention (understand context)
→ All K and V stored in cache
→ Pay "input tokens × $0.14/M"

↓

[Decode Phase]
AI starts generating one word at a time:

   Generate 1st word:
     → [BOS] queries cached K with its Q
     → Context vector
     → Probability distribution
     → Sample: "def"
   Generate 2nd word:
     → "def" queries cached K + new token's K
     → ...
     → Sample: "add"
   Generate 3rd word:
     → ...

↓

Each word = pay one word's output cost
Until the model outputs an end marker or hits the limit

↓

You get the complete response
```

## Summary: Three Core Takeaways

| Point | What it means |
|-------|--------------|
| **What Transformer does** | Given history, predict the most likely next word. Not creation, probability prediction |
| **What Attention is** | Each token uses Q (question) to query K (keys) from all other tokens, then weights V (values) by relevance |
| **Prefill vs Decode** | Prefill = process all input in parallel, compute and cache QKV. Decode = generate one at a time, reuse cached K and V |

## Appendix: Connection to Billing

If you read [LLM Billing: What Are You Actually Paying For?](/tech/2026/04/27/llm-billing-explained), you can now connect these three pieces:

```
Prefill covers all input tokens → that's your "input cost"
Decode generates new tokens one by one → that's your "output cost"
KV Cache stores K and V → saves Prefill computation, doesn't directly change your bill
                              But DeepSeek passes the savings to you → cache hit pricing is lower
```
