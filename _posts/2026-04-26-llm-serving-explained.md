---
layout: post
title: "LLM Serving: GPU Memory, KV Cache, and Large-Scale Inference"
date: 2026-04-26
categories:
  - Tech
tags:
  - LLM
  - Serving
  - GPU
  - KV Cache
  - MoE
---

> This article covers GPU memory usage, KV Cache, and serving engineering for large language models. No prior knowledge assumed.

## Model Weights vs KV Cache: A Chef and Their Sticky Notes

### Analogy

```
Model weights = everything the chef knows about cooking
                Once learned, never forgotten. Shared across all dishes.

KV Cache      = sticky notes the chef writes while cooking one specific dish
                Trashed when that dish is done. Rewritten for every user, every conversation.
```

### Numbers

Using DeepSeek V4 Flash (70B params, MoE, 13B activated per token):

| | Model Weights | KV Cache |
|---|---|---|
| **Content** | All neural network parameters (billions of numbers) | K and V vectors per token |
| **Size** | Fixed: 70B params × 2 bytes ≈ 140GB | Dynamic: ~32KB / token |
| **For 1M tokens** | Fixed 140GB (doesn't change) | ≈ 32GB |
| **Lifetime** | Loaded once, stays until restart | Per session, freed after generation |
| **Ownership** | **Shared across all users** | **One per user, one per conversation** |
| **Analogy** | The cookbook itself | A sticky note for today's dish |

### GPU memory layout

```
┌─────────────────────────────────────────────────┐
│              Single GPU VRAM (80GB)              │
├─────────────────┬───────────────────────────────┤
│  Model weights  │        KV Cache               │
│  ~35GB (INT4)   │    allocated on demand         │
│  Shared by all  │    ~4-16GB per active session  │
├─────────────────┴───────────────────────────────┤
│              Other overhead                      │
│    intermediate buffers, temp storage            │
└──────────────────────────────────────────────────┘
```

### The relationship

Running one inference request requires both:

```
Step 1: Load model weights into VRAM (one-time cost, regardless of user count)
Step 2: User sends message → allocate KV Cache VRAM on demand
Step 3: Generation done → KV Cache freed (weights stay)
Step 4: New message arrives → KV Cache re-allocated
```

## Scaling to Hundreds of Millions of Users

### The common misconception

The scary formula: "100M users × 100GB each = astronomical numbers"

This assumes: **all users are actively using VRAM at the same time.**

```
Real usage pattern:

User is online but idle ┌─── barely uses any VRAM ────┐
                        ↓
User types → AI generates │ Occupies KV Cache, but only seconds to minutes
(process takes 30-60s)    │
                        ↓
User reads results        ┌─── KV Cache freed ────────┘

Average 5 uses per day, 30 seconds each
= 150 seconds/day = 2.5 minutes of actual generation
= 99.97% of the time, this user uses zero VRAM
```

The reality: not "100M users all at once." More like "100M daily visits, concurrent active users in the tens of thousands."

## The Seven-Layer Serving Stack

### Layer 1: Shared Model Weights (fundamental)

No matter how many users, model weights live once in GPU memory.

```
No matter how many users are chatting simultaneously
DeepSeek's model weights: one copy

User 1, User 2, ... User N all use the same model weights
```

The idea that "every user needs their own model" is wrong from the start.

### Layer 2: Continuous Batching

Group multiple users' requests together and compute them as one batch.

```
Traditional (inefficient):
  User 1's request → done → User 2's request → done → ...
  GPU idle most of the time. Utilization < 30%

Continuous batching (efficient):
  Requests from users 1-100 → form a batch → compute together
  GPU utilization up to 70-90%
```

Batching 10 users together triples GPU utilization, effectively cutting hardware cost by 3x.

### Layer 3: Paged Attention (vLLM's core contribution)

**Problem**: Traditional KV Cache requires contiguous memory, like a single sheet of paper. Allocate too much and it's wasted. Too little and it doesn't fit.

**Solution**: Split KV Cache into 4MB pages, managed like virtual memory in an operating system.

```
Traditional (contiguous):
  User A's cache: block 1  block 2  block 3  block 4 (must be contiguous, gaps unusable)
  User B's cache: wait for A to finish

vLLM (paged):
  User A's cache: page 1  page 5  page 8  (allocated on demand, no contiguity needed)
  User B's cache: page 2  page 3  page 9  (runs in parallel, no waiting)
  VRAM utilization: 20-30% → 80%+
```

Same number of GPUs can serve 3-4x more users simultaneously.

### Layer 4: INT8 / INT4 Quantization

Compress model weights to reduce VRAM usage:

```
bfloat16 (full precision): 2 bytes per number
INT8 (8-bit integer):      1 byte per number  →  50% less VRAM
INT4 (4-bit integer):      0.5 bytes per number →  75% less VRAM
```

A small drop in precision, almost no visible effect on output quality. Every major AI company does this.

### Layer 5: KV Cache Selective Dropping and Compression

Nobody actually stores unlimited KV Cache for every user. Real approaches:

```
Option A: Truncation
  → Drop everything beyond a limit. Keep only recent content.

Option B: Sliding Window
  → Keep only the last N tokens' cache (like human memory).

Option C: Summarization
  → Summarize long history, replace raw history with the summary.

Option D: Sparse Attention
  → Only attend to important tokens (keywords, named entities).
  → Less important tokens don't get full K and V.
```

### Layer 6: MoE Architecture (DeepSeek V4 Flash's specialty)

> Common misconception about MoE: MoE mainly saves **compute (FLOPs)**, not **memory (VRAM)**. All experts must still be fully loaded into VRAM because different tokens may route to different experts.

#### Why all experts must be in VRAM

MoE expert selection isn't "pick once and done." It's **dynamic per token**:

```
Same input: "I like eating apples"

Token "I"     → routes to experts [E7, E42] (handles single words and tone)
Token "like"  → routes to experts [E3, E15] (handles emotion)
Token "eat"   → routes to experts [E22, E58] (handles actions)
Token "apple" → routes to experts [E31, E77] (handles concrete nouns)
```

If you only loaded E7 and E42, when "apple" needs to route to E31, E31 isn't in VRAM. You can't run it.

#### Analogy: 200 specialists in an ER

```
The hospital has 200 specialists (284B params).
Each patient gets assigned 1-2 doctors at triage (13B activated).
This patient sees cardiology (E7), the next sees orthopedics (E31).

Do you only need a cardiologist on staff?
No. You don't know whether the next patient needs orthopedics or neurology.

All 200 doctors must be on duty (all 284B params loaded).
But each patient only sees 1-2 doctors (~13B activated per token).
```

#### Numbers

```
DeepSeek V4 Flash (MoE):
  Total params: 284B
  Activated params: ~13B (per token)
  Precision: INT4

VRAM needed (model weights):
  bf16: 284B × 2 bytes ≈ 568GB  ← total is large
  INT4: 284B × 0.5 bytes ≈ 142GB
  ✓ Need VRAM for all 284B (total VRAM)

Compute needed (per token):
  Dense model (70B): compute all 70B params per token
  MoE model (284B/13B): compute only ~13B params per token
  ✓ Saves compute, not VRAM
```

#### But there is a money-saving trick: Expert Parallelism

The **total** needs 284B of VRAM, but you can **spread different experts across different GPUs**:

```
Spread 256 experts across 32 GPUs:

GPU 0:  experts [E0-E7]  + Attention layers (every GPU has these)
GPU 1:  experts [E8-E15] + Attention layers
GPU 2:  experts [E16-E23] + Attention layers
...
GPU 31: experts [E248-E255] + Attention layers

Token "apple" routes to E31 → it's on GPU 3
→ Send "apple"'s intermediate result over the network to GPU 3
→ GPU 3 computes, sends the result back
```

Each GPU stores only ~9B expert params + Attention layers, needing ~16GB for weights per card. This is what **actually makes MoE cost-effective in engineering** (horizontal scaling).

#### MoE savings summary

```
┌─────────────────────────────────────────────────────┐
│ What MoE saves and what it doesn't                   │
├────────────────────┬────────────────────────────────┤
│ Saves compute      │ 13B/284B activated per token    │
│ Saves per-GPU VRAM │ Each card stores only part of   │
│                    │ the experts (but needs many cards)│
│ Doesn't save total │ 284B is 284B. Total is that big  │
│ params             │                                  │
│ Doesn't save disk  │ Model file ~150-570GB            │
│ Doesn't save total │ All GPUs combined still need to  │
│ VRAM               │ hold all 284B params             │
└──────────────────────────────────────────────────────┘
```

### Layer 7: Tiered Inference + Cheap Model Routing

Not every request needs the strongest model:

```
Simple request ("write a hello world")
  → Route to cheap small model (Qwen-7B / DeepSeek-V3)
  → Low cost, fast, works great

Medium request ("optimize this SQL query")
  → Route to mid-tier model (DeepSeek-V4-Flash)
  → Medium cost

Complex request ("refactor the entire backend architecture")
  → Route to strongest model (Claude Opus / GPT-5)
  → High cost but best results
```

80% of requests are simple and handled by cheap models. Only 20% need the expensive ones.

## The Distributed Inference Cache Miss Problem

### What happens

```
User's first conversation (Turn 1)
  → Load balancer sends to GPU-A, KV Cache lives on GPU-A
  → Conversation ends, user goes away

An hour later, user returns (Turn 2)
  → Load balancer sends to GPU-B (GPU-A is busy now)
  → GPU-B doesn't have Turn 1's KV Cache
  → Either recompute Turn 1, or degrade quality

If lucky enough to go back to GPU-A:
  → But GPU-A may have LRU-evicted the cache due to other users
  → Still a miss
```

### Solution 1: Session Affinity (Sticky Routing)

The load balancer keeps a mapping table:

```
session_id → gpu_id

{"sess_abc123": "gpu-07", "sess_def456": "gpu-15", ...}

Turn 1: user arrives → assigned to GPU-07
        → record sess_abc123 → GPU-07
Turn 2: user returns → lookup sess_abc123 → force route to GPU-07
```

Problem: what if GPU-07 is fully loaded?

Real approach is more flexible: **Session Affinity within the same Pod (GPU group)**

```
A group of GPUs [GPU-07, GPU-08, GPU-09, GPU-10] forms a Pod

Turn 1 → Pod-6 (handled by GPU-07)
Turn 2 → still within Pod-6, assigned to GPU-09
        → GPU-07 and GPU-09 are connected via NVLink/InfiniBand
        → KV Cache can transfer over high-speed interconnect (microsecond latency)
```

### Solution 2: KV Cache Offloading (to CPU memory / disk)

When you can't afford to recompute but don't want to lose the cache:

```
GPU VRAM (HBM)    → fastest but expensive, small capacity ← default cache location
  ↓ eviction
CPU memory (DDR)  → medium speed, large capacity (~512GB/1TB) ← cold data
  ↓ eviction
NVMe SSD          → slow, massive capacity ← coldest data

User Turn 1 ends → KV Cache from GPU → CPU memory
User Turn 2 returns → KV Cache from CPU → GPU (tens of ms vs seconds to recompute)
```

Trade-off: CPU→GPU transfer has latency, but it's much faster than a full Prefill.

### Solution 3: Prefix Cache Shared Across Users

It's not just your session's cache that gets reused. **Other people's caches can help too.**

```
User A and User B both use the same system prompt:

System: "You are a programming assistant. Reply in Chinese..."

User A asks: "write a quicksort"           ↓
User B asks: "write a bubble sort"          ↓
                    ↓
System prompt is identical → KV Cache shared across users

User A triggers Prefill first:
  [System] → [You] → [are] → [a] → ... → KV Cache stored

User B's request later:
  System prompt detected as exact match → directly reuse User A's cache
  Only needs to compute "write a bubble sort"
```

This is exactly what API pricing calls **Cache Hit / Cache Miss**:

- Cache Hit: system prompt (plus partial user prefix) was already computed by someone else
- Cache Miss: this content is appearing for the first time, no cache exists

### Solution 4: Automatic Prefix Caching (vLLM native support)

Instead of exact string matching, it **matches token sequences automatically**:

```
Input: "Please write a quicksort algorithm for me"

System detects:
  "Please write a" → cache hit (other users asked similar questions before)
  "quicksort algorithm for me" → may miss (specific content differs)

Actual effect:
  Longer prefix match → more compute saved
  Common openings like "You are a programming assistant..." → extremely high hit rate
```

### Solution 5: Session Timeout + Tiered Cache Strategy

```
User A finishes a conversation:
  Turn 1 → Turn 2 (within 5 minutes)
    → Likely assigned to same GPU (cache still in VRAM)
    → Cost: near zero

  Turn 1 → Turn 2 (30 min to 1 hour)
    → Cache may be offloaded to CPU memory
    → On return, reload to GPU
    → Cost: medium (tens of ms transfer latency)

  Turn 1 → Turn 2 (past timeout, typically 5-15 min)
    → Cache released
    → Full Prefill next time
    → Cost: high (seconds of compute)
```

### Cost comparison across scenarios

```
Scenario                                                    | Cost
───────────────────────────────────────────────────────────|──────────
Turn 2 routes to same GPU, KV Cache still present          | Near 0
Turn 2 back to same Pod, cache via high-speed interconnect | Microsecond latency
Turn 2 on different Pod, cache loaded from CPU             | Tens of ms
Turn 2 on different Pod, cache evicted                     | Full Prefill (seconds)
Turn 2 prefix cache hit (Cache Hit pricing)                | ~$0.028/M token
Turn 2 no cache at all (Cache Miss pricing)                | ~$0.14/M token
```

### The core idea

```
Don't try to avoid all cache misses.
Instead, split cache misses into "expensive" and "cheap."

Cheap cache miss:
  System prompt already cached (someone else's reuse)
  → Only compute the user-specific part
  → Most users fall here

Expensive cache miss:
  The entire prefix has never been computed by anyone
  → Relatively rare (system prompts hardly change)

API pricing already reflects this:
  Cache Hit = most cases
  Cache Miss = minority of cases
  Average cost is baked into the price
```

## Real Resource Estimate for 100M Users

```
Assumptions (2026 typical numbers):
  - Registered users: 100M
  - Daily active users (DAU): 10M (10%)
  - Concurrently generating users: ~100K (1% of DAU)

Peak VRAM per user:
  - Model weights (shared by all): 35GB (INT4 quantized, one copy)
  - KV Cache (while generating): ~8GB (on demand)

KV Cache needed for 100K concurrent users:
  100K × 8GB = 800TB VRAM

With the seven-layer optimization stack:
  - Paged Attention         → 3x VRAM efficiency
  - Continuous batching     → 10x concurrency efficiency
  - Idle users don't use cache → concurrency drops to 1/10
  - Sliding window / Summarization → 5x less per-user VRAM

Final GPU count needed:
  ~500-2000 H100/A100 GPUs (total cost ~$150M-$500M)
```

Compare this to running a 70B model locally (2-4 H100s = $200K-$400K). Cloud services share weights, batch, and schedule to spread the cost across every user.

**This is what LLM serving is really about: using software and scheduling to serve millions of users with one hardware cluster, instead of giving everyone their own hardware.**

## Summary

| Question | Answer |
|---------|--------|
| Model weights vs KV Cache | Weights are "knowledge" (permanent, shared). KV Cache is "sticky notes" (temporary, per-session) |
| Does MoE save VRAM or compute? | **Saves compute, not VRAM.** All 284B params must be in VRAM, but only 13B are computed per token |
| What does Expert Parallelism do? | Spreads experts across GPUs. Per-card VRAM drops to 1/N, connected via InfiniBand |
| How to solve cross-GPU cache misses | Session Affinity (sticky routing) + KV Offloading + Prefix Cache sharing across users |
| Why can Prefix Cache be shared? | System prompts are identical ("You are a programming assistant..."). Different users can reuse |
| Do 100M users mean astronomical hardware? | No. They don't all use it at once. With batching, weight sharing, and cache reuse, it's thousands of GPUs |
| How does DeepSeek do it? | Seven-layer stack: shared weights + continuous batching + Paged Attention + quantization + KV compression + MoE + tiered routing |
| Biggest breakthrough | Paged Attention (vLLM) pushed VRAM utilization from 20% to 80%. Same hardware, 4x more users |

## Appendix: Compute and Time Quick Reference

### FLOPs formulas

```
Prefill FLOPs  ≈  6 × P_activated × n  +  4 × d_hidden × n²

  Linear term (6Pn): all activated params × token count
    → Complexity O(n), dominates for short text

  Quadratic term (4dn²): attention score computation
    → Complexity O(n²), dominates for long text
```

```
Decode FLOPs (per step)  ≈  6 × P_activated  +  4 × d_hidden × n

  Each step is only O(n) attention + fixed activated params
  → Much smaller per-token compute than Prefill
  → Mainly limited by memory bandwidth, not compute
```

### Bottleneck intuition

```
Linear dominant ←──→   Quadratic dominant
        ↓                  ↓
     Short text         Long text (>50K tokens)
     Compute ∝ n        Compute ∝ n²

  Impact of growing n:
    n × 2  → Linear × 2, Quadratic × 4
    n × 4  → Linear × 4, Quadratic × 16
    n × 10 → Linear × 10, Quadratic × 100
```

### Prefill time (13B activated, FP8, H100)

Multi-GPU times scale roughly proportionally (overhead makes actual slightly higher).

| Input length | 1×H100 | 8×H100 | Common use case |
|------------|--------|--------|----------------|
| 1K | ~0.05-0.2s | -- | Quick Q&A |
| 4K | ~0.3-0.8s | ~0.05-0.1s | Short conversation |
| 16K | ~1-3s | ~0.2-0.5s | Medium document |
| 32K | ~3-8s | ~0.5-1.5s | Code repository analysis |
| 64K | ~8-20s | ~1-3s | Technical document analysis |
| 128K | ~20-60s | ~3-10s | Paper review |
| 1M | ~10-30 min | ~1-4 min | Full repo analysis |

> Actual latency varies by model architecture, quantization precision, FlashAttention implementation, and memory bandwidth utilization. These are ballpark ranges good for building intuition.

### Prefill vs Decode

| | Prefill | Decode (per step) |
|---|---|---|
| **What it processes** | All input tokens at once | One output token at a time |
| **Complexity** | O(n × P + n² × d) | O(P + n × d) |
| **Bottleneck** | Compute-bound (GPU FLOPs) | Bandwidth-bound (VRAM bandwidth) |
| **FLOPs utilization** | 30-50% | 2-5% |
| **4K time** | ~0.5s | ~8ms/step, ~0.4s total |
| **128K time** | ~40s | ~36ms/step, ~5s total |
| **Which dominates** | Prefill dominates when n > 1K | Decode dominates for long outputs |

> For short 4K text, Prefill (0.5s) is actually slower than full 4K Decode (0.4s), because each Decode step computes only one token with minimal bandwidth. For 128K long text, Prefill (~40s) far exceeds Decode (~5s) because the quadratic term explodes. **This explains why LLM providers care more about optimizing long-context Prefill than Decode.**
