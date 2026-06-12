---
layout: post
title: RAG Learning Notes (For Java / AI Agent Engineers)
date: 2025-08-12
categories: [AI, Tech]
tags: [RAG, Embedding, VectorDatabase, AI, LearningNotes]
---

## 1. What is RAG

RAG stands for **Retrieval-Augmented Generation**.

Core flow:

```text
User Query
   ↓
Retrieval / Recall
   ↓
Relevant Document Chunk
   ↓
LLM Generates Answer
```

In essence: first find relevant knowledge, then have the LLM generate an answer based on that knowledge.

---

## 2. What is Embedding

### 2.1 What is an Embedding Model?

An Embedding Model is a special type of neural network that converts **text into vectors**.

| Model Type | Input | Output |
|-----------|-------|--------|
| LLM | Text | Text |
| Embedding Model | Text | Vector |

Example:

```text
Input: 请假制度 (Leave Policy)
Output: [0.15, -0.33, 0.87, ...]
```

Common dimensions: 768, 1024, 1536, 3072.

---

### 2.2 Is Embedding a training process?

No. There are two distinct phases:

1. **Training the Embedding Model** — done by the model vendor, consuming massive GPU resources and data.
2. **Using the Embedding Model** — in your RAG system, converting text to vectors is purely inference.

The vector library creation process:

```text
Document → Chunking → Embedding Model → Vectors → Store in Vector DB
```

You are not retraining the model.

---

### 2.3 Why do semantically similar texts have close vector distances?

Because the Embedding Model is trained to make **semantically similar texts have closer vectors**.

The model learns associations from vast amounts of text:

```text
"leave" ≈ "vacation"
"annual leave" ≈ "paid time off"
```

The principle in one sentence: **A word's meaning is determined by the company it keeps.**

For example, "bowl", "chopsticks", "tableware", "eating" frequently appear in similar contexts, so their vectors end up close. Not just synonyms — words from the same domain, strongly related concepts, or similar contexts also cluster together. So "bowl" and "chopsticks" may have close vectors even though they aren't synonyms.

---

## 3. Vector Databases and ANN

### 3.1 Why do we need vector databases?

A vector database stores **Chunk + Embedding Vector** and supports efficient similarity search.

### 3.2 What is ANN?

ANN = **Approximate Nearest Neighbor**. The goal is to **trade a small amount of accuracy for a massive speed boost**.

If you have 100 million vectors, comparing them one by one is too expensive. ANN builds an index structure to speed up searches.

### 3.3 Common ANN Algorithms

#### HNSW

Full name: **Hierarchical Navigable Small World**

Characteristics: fast, high recall, currently the most popular.

Databases that support HNSW: **Qdrant**, **Milvus**, **pgvector**.

#### IVF

Full name: **Inverted File Index**

Idea: first partition into buckets, then search within each bucket.

Characteristics: fast to build, low memory usage, typically lower precision than HNSW.

#### PQ

Full name: **Product Quantization**

Purpose: compress vectors to reduce storage and memory usage. Suitable for very large datasets, but loses some precision.

### 3.4 Which layer do these belong to?

ANN is a **vector database** configuration, not an Embedding Model configuration. For example:

```sql
CREATE INDEX USING hnsw ...
```

Or:

```yaml
collection:
  hnsw
```

---

## 4. Chunking: Why it determines RAG's upper bound

The vector search operates on **Chunks**, not entire documents.

### 4.1 Problem with chunks that are too small

If a chunk is only 50 characters:

```text
Needs manager approval
```

Without enough context, the Embedding representation becomes fuzzy.

### 4.2 Problem with chunks that are too large

If a chunk has 5000 characters covering leave policy, expense policy, and attendance policy all at once, a single vector has to represent multiple topics, diluting the similarity score during queries.

### 4.3 Reasonable chunk sizes

Rule of thumb:

- Chunk size: **500~1000 Tokens**
- Overlap: **50~200 Tokens**

Overlap prevents information from being cut off at boundaries.

### 4.4 Why "Chunking determines RAG's upper bound"

Because no matter how good the Embedding model is, it can only search within the chunks you've created. If critical information is fragmented or mixed together, recall will fail.

Many enterprise projects perform poorly not because of the model, but because of:

- Poor document parsing
- Poor chunking strategy
- Poor metadata design

---

## 5. Recall and Rerank

### 5.1 What is Recall?

Recall means finding candidate chunks from a massive pool:

```text
1,000,000 Chunks → Top 100 Candidates
```

If the correct answer isn't in the candidate set, no LLM can save you.

### 5.2 Rerank

#### Why do we need Rerank?

Vector retrieval (Embedding Recall) is fast at finding candidates from millions of items, but its ranking isn't always accurate.

For example, a user asks "How do I apply for annual leave?" and the recall results are:

1. Employee Attendance Policy
2. Employee Leave Policy
3. Employee Expense Policy

In reality, "Employee Leave Policy" should be ranked first, but the vector search didn't put it on top. Rerank is designed to fix this.

#### Position in RAG

```text
User Query
    ↓
Embedding Recall
    ↓
Top 50 Chunks
    ↓
Rerank
    ↓
Top 5 Chunks
    ↓
LLM
```

#### How it works

The Rerank model takes a **[Question, Document]** pair and outputs a relevance score:

```text
[Question]
How do I apply for annual leave?

[Document]
Employee Leave Policy...

Output:
0.98
```

Higher score means more relevant. Results are then re-sorted by score.

#### Embedding vs. Rerank

| Dimension | Embedding | Rerank |
|-----------|-----------|--------|
| Architecture | Bi-Encoder | Cross-Encoder |
| Speed | Fast | Slow |
| Best for | Recall | Precision ranking |

Simply put: **Embedding finds candidates, Rerank re-orders them.**

#### Common Rerank Models

Recommended:

- **bge-reranker-v2-m3**
- **bge-reranker-large**
- **jina-reranker-v2**
- **Cohere Rerank**

#### Common Enterprise Architectures

Small projects:

```text
Embedding + LLM
```

Medium to large projects:

```text
Embedding + Rerank + LLM
```

Production (standard):

```text
BM25 + Embedding Recall + Rerank + LLM
```

#### Practical Advice

For Chinese-language RAG projects, start with **bge-m3 + bge-reranker-v2-m3** to get the recall pipeline working before considering other models.

---

## 6. Hybrid Search

Hybrid Search = **Semantic Search + Keyword Search**.

Vector search excels at semantic understanding (e.g., "annual leave" ≈ "vacation"), while keyword search is better at exact matching (e.g., "ERR_10086", "JDK21", config keys).

BM25 is the most popular keyword retrieval algorithm. The core idea is simple: **the more frequently a word appears in a document and the rarer it is across the entire corpus, the higher its score**. Roughly speaking, it's the weighted product of term frequency and inverse document frequency — how many query terms appear in a given chunk and how often they occur, producing a final relevance score.

Typical architecture:

```text
User Query
   ├─ BM25 / Keyword Search
   └─ Vector Search
        ↓
      Merge
        ↓
      Rerank
        ↓
      LLM
```

This is essentially standard in production environments.

---

## 7. Impact of Embedding Models on RAG

The Embedding model directly determines recall quality. Rough estimate (purely empirical):

| Factor | Impact |
|--------|--------|
| Chunking | 40% |
| Embedding Model | 30% |
| Rerank | 20% |
| Vector Database | 10% |

### Mainstream Embedding Models

#### OpenAI

- **text-embedding-3-small**
- **text-embedding-3-large**

Characteristics: stable performance, plug-and-play, paid, requires internet access.

#### BGE Series (Popular in China)

From BAAI (Beijing Academy of Artificial Intelligence). Common models:

- **bge-small-zh**
- **bge-large-zh**
- **bge-m3**

Characteristics: strong Chinese language performance, supports local deployment, very popular in RAG scenarios.

#### Other Open-Source Models

- **e5-large-v2** (Microsoft)
- **gte-large** (Alibaba)
- **jina-embeddings-v3** (Jina AI)

### How to evaluate model quality?

The common benchmark is **MTEB (Massive Text Embedding Benchmark)**, which serves as a leaderboard for Embedding models. But in practice, for Chinese knowledge bases, code documentation, and operations manuals, you'll still need to run A/B tests with your own data to know which model truly works best.

---

## 8. Vector Database: pgvector or Specialized Vector DB?

### pgvector

Essentially **PostgreSQL + Vector type**. Advantages: compatible with your existing Java tech stack, low development cost, suitable for small to medium-scale RAG.

### Qdrant / Milvus

Suitable for: 10M+ vectors, high-concurrency search, complex filtering, and distributed deployment. Core strengths include HNSW optimization, sharding and replication, Hybrid Search, and Metadata Filter.

### Practical Advice

For Java engineers getting started with RAG:

1. **Start with pgvector** to get the full pipeline working — Spring Boot + LangChain4j + PostgreSQL + pgvector.
2. Once you truly understand recall and chunking, consider Milvus or Qdrant for more demanding scenarios.

---

## 9. Is the Embedding Model a Library or a Service?

Either approach works.

### Service Mode (Most Common)

```text
Spring Boot → HTTP → Embedding Service
```

Examples: **Ollama**, OpenAI Embeddings API, Jina AI Embeddings API.

### Local Library Mode

Load ONNX / PyTorch models directly in-process for inference. Suitable for offline or small-scale scenarios.

### Why mention Ollama?

Because Ollama can run both LLMs and Embedding models:

```bash
ollama pull bge-m3
ollama embeddings bge-m3 "请假制度"
```

Many local RAG systems use Ollama as a unified manager:

```text
Ollama
├── qwen3
├── deepseek-r1
├── bge-m3
└── bge-reranker
```

---

## 10. End-to-End RAG Architecture (Recommended View)

A complete RAG pipeline has two phases: **Indexing (Offline)** and **Query (Online)**.

### Indexing Phase

```text
Document
    ↓
Chunking
    ↓
Embedding
    ↓
Vector DB (ANN: HNSW)
```

This is done offline: documents are split, vectorized, indexed, and stored in the database for future queries.

### Query Phase

```text
User Query
    ↓
Embedding
    ↓
┌─ Vector Search (ANN) ──┐
│  + Metadata Filter     │  ← Hybrid Search
│  + BM25 / Keyword      │
└──────────┬─────────────┘
           ↓
         Merge
           ↓
         Rerank
           ↓
           LLM
           ↓
         Answer
```

### Component Responsibilities

- **Chunking**: determines whether knowledge is properly expressed (splitting long documents into appropriate fragments)
- **Embedding Model**: determines semantic map quality, mapping text into vector space
- **ANN (HNSW)**: determines search speed, building indexes to accelerate approximate search
- **Metadata Filter**: filters results by tags, timestamps, types, etc. during search to narrow the scope
- **Hybrid Search**: combines semantic search (Vector) and keyword search (BM25) for both semantic understanding and exact matching
- **Rerank**: re-scores recalled results to improve Top-K precision
- **LLM**: generates the final answer based on retrieved context

### What is Metadata Filter?

Metadata refers to additional attributes attached to documents, such as:

- Document type (PDF / Word / Markdown)
- Upload time (2026-01-01)
- Tags ("Leave", "Finance")
- Author, department, etc.

During search, you can apply Metadata filtering first (**pre-filter**) to narrow the search scope, then execute vector search; or you can search vectors first and filter afterward (**post-filter**). Proper use of Metadata Filter can significantly improve query efficiency and precision.