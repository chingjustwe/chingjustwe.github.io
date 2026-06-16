---
layout: post
title: "GraphRAG & Agentic RAG: From Classic RAG to Intelligent Retrieval"
date: 2025-08-16
categories: [AI, Tech]
tags: [RAG, GraphRAG, AgenticRAG, AI, LearningNotes]
---

Following up on [RAG Learning Notes]({% post_url 2025-08-12-rag-learning-notes-en %}), this post covers two advanced RAG directions: GraphRAG and Agentic RAG.

In short:

- **GraphRAG** moves from "text retrieval" to "knowledge structure retrieval"
- **Agentic RAG** moves from "fixed pipeline retrieval" to "dynamic strategy retrieval"

---

# Part 1: GraphRAG

## What is GraphRAG

The classic RAG pipeline goes Chunk → Embedding → Vector Search → Rerank → LLM. It only cares about semantic similarity, not the relationships between pieces of knowledge. Multi-hop reasoning is essentially impossible, and information scattered across chunks is hard to piece together.

GraphRAG introduces a graph structure to solve this. It turns knowledge from "a pile of text chunks" into a network of entities, relations, and paths.

For example:

```
Employee A → submits → Leave Request → Manager B → approves
```

## Workflow

Four steps:

1. **Knowledge graph construction**: Extract entities and relations from documents.
2. **Build the graph**: Organize entities and relations into a graph.
3. **Retrieval**: User question → find relevant entities → traverse 1~2 hops along the graph → extract paths.
4. **Generation**: Convert paths to text and feed them to the LLM.

Using the same example, the retrieved path becomes "Employee A submitted a leave request, approved by Manager B."

## Strengths

| Capability | Description |
|------------|-------------|
| Multi-hop reasoning | Supports reasoning across nodes |
| Structured knowledge | Doesn't depend on text similarity |
| Interpretability | Paths are traceable |

## Limitations

GraphRAG is no silver bullet. Construction cost is high (entity/relation extraction), graph maintenance is complex, and the query system is more involved. It doesn't replace vector search — it complements it.

## Production Architecture

A typical enterprise setup combines multiple engines:

- Qdrant: vector recall
- Elasticsearch: keyword search
- Neo4j: knowledge graph

Pipeline:

```
Query → Vector Recall → Graph Expansion → Path Extraction → Rerank → LLM
```

---

# Part 2: Agentic RAG

## What is Agentic RAG

Classic RAG has a clear problem: it's a fixed pipeline — retrieve once, no reflection, no strategy adjustment.

Agentic RAG lets the LLM control the retrieval process itself. It decides which data sources to query, which tools to use, whether to re-query, and whether to continue reasoning.

## Workflow

```
User Query
   ↓
LLM Planner (decision)
   ↓
Tool Call (Vector / ES / Graph)
   ↓
Observation (results)
   ↓
LLM re-evaluates → loop (multiple rounds)
   ↓
Final Answer
```

## Core Capabilities

- **Query Rewriting**: automatically rewrites questions to improve retrieval quality
- **Tool Routing**: selects the right data source — Vector DB, ES, or Graph DB
- **Multi-step Retrieval**: supports multiple rounds, not a one-shot deal
- **Self-reflection**: keeps searching if results are unsatisfactory

## Agentic RAG vs Rerank

Rerank is just a sorter — input query + documents, output re-ranked results. It doesn't control the flow, single round.

Agentic RAG is the whole pipeline's scheduler — decides whether to retrieve, which tools to use, supports multiple rounds, and can rewrite the query. In Java terms: Rerank is a Comparator, Agentic RAG is a Controller.

| Dimension | Rerank | Agentic RAG |
|-----------|--------|-------------|
| Role | Sorter | Scheduler |
| Controls flow? | ❌ | ✔️ |
| Multi-round? | ❌ | ✔️ |
| Calls tools? | ❌ | ✔️ |

## Engineering Architecture

```
               LLM Agent (Planner)
                       ↓
    ┌──────────────────┼──────────────────┐
    ▼                  ▼                  ▼
Vector Tool        ES Tool         Graph Tool
(Qdrant)          (Elastic)        (Neo4j)
    └──────────────────┬──────────────────┘
                       ▼
                Observation Layer
                       ▼
                    Reranker
                       ▼
                     LLM
```

At its core, it's about letting the LLM decide how to do RAG, instead of wiring a fixed pipeline.

---

# Part 3: GraphRAG vs Agentic RAG

| Dimension | GraphRAG | Agentic RAG |
|-----------|----------|-------------|
| Core capability | Structured knowledge | Dynamic decision-making |
| Focus | Data structure | Execution strategy |
| Technical core | Graph | Agent Loop |
| Problem solved | Multi-hop reasoning | Multi-round retrieval |

They're not competing:

- GraphRAG enhances knowledge structure
- Agentic RAG enhances retrieval strategy

They can combine into a complete form: Agent + Vector + Graph + ES + Rerank.

---

# Part 4: Summary

GraphRAG helps AI "understand relationships between knowledge." Agentic RAG helps AI "decide how to acquire knowledge."

A typical evolution path:

```
RAG → Hybrid RAG → GraphRAG → Agentic RAG → Agentic GraphRAG
```

To put it simply: **GraphRAG solves "how knowledge is organized," Agentic RAG solves "how knowledge is retrieved."**
