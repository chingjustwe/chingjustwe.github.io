---
layout: post
title: GraphRAG & Agentic RAG：从传统 RAG 到智能检索系统的进化
date: 2026-06-16
categories: [AI, Tech]
tags: [RAG, GraphRAG, AgenticRAG, AI, LearningNotes]
---

接 [RAG Learning Notes]({% post_url 2025-08-12-rag-learning-notes-en %})，这篇聊两个 RAG 进阶方向：GraphRAG 和 Agentic RAG。

简单说：

- **GraphRAG**：从"文本检索"走向"知识结构检索"
- **Agentic RAG**：从"固定流程检索"走向"动态策略检索"

---

# 一、GraphRAG

## 什么是 GraphRAG

传统的 RAG 流程是 Chunk → Embedding → Vector Search → Rerank → LLM。它只关心语义相似度，不关心知识之间的关系。多跳推理基本做不了，信息分散在多个 chunk 里也很难拼起来。

GraphRAG 引入图结构来解决这个问题。把知识从"一堆文本块"变成"实体 + 关系 + 路径"的网络。

举个例子：

```
员工A → 提交 → 请假申请 → 主管B → 审批
```

## 工作流程

分四步：

1. **知识建图**：从文档中抽取实体和关系。
2. **构建 Graph**：把实体和关系组织成图。
3. **检索**：用户问题 → 找到相关实体 → 沿图扩展 1~2 跳 → 获取路径。
4. **生成**：把路径转成文本，喂给 LLM。

还是上面那个例子，检索到的路径转成文本就是"员工A提交请假申请，由主管B审批"。

## 优势

| 能力 | 说明 |
|------|------|
| 多跳推理 | 支持跨节点推理 |
| 结构化知识 | 不依赖文本相似度 |
| 可解释性 | 可追溯路径 |

## 局限

GraphRAG 不是银弹。构建成本高（需要抽实体/关系），图维护复杂，查询系统复杂度也高。它不能替代向量检索，更多是补充。

## 工业级架构

典型企业实现是多个引擎配合：

- Qdrant：向量召回
- Elasticsearch：关键词检索
- Neo4j：知识图谱

流程：

```
Query → Vector Recall → Graph Expansion → Path Extraction → Rerank → LLM
```

---

# 二、Agentic RAG

## 什么是 Agentic RAG

传统 RAG 的问题很明显：固定 pipeline，只检索一次，没法反思，没法调整策略。

Agentic RAG 让 LLM 自己控制检索过程——它来决定查什么数据源、用什么工具、要不要重新查、要不要继续推理。

## 工作流程

```
User Query
   ↓
LLM Planner（决策）
   ↓
Tool Call（Vector / ES / Graph）
   ↓
Observation（结果）
   ↓
LLM 再判断 → 循环执行（多轮）
   ↓
Final Answer
```

## 核心能力

- **Query Rewriting**：自动改写问题提升检索效果
- **Tool Routing**：选择合适数据源——Vector DB、ES、Graph DB
- **Multi-step Retrieval**：支持多轮检索，不是一次完事
- **Self-reflection**：结果不满意就继续搜

## Agentic RAG vs Rerank

Rerank 只是个排序器——输入 query + documents，输出排序结果。它不控制流程，单轮执行。

Agentic RAG 是整个流程的调度器——决定是否检索、用什么工具、可以多轮、可以改写 query。用 Java 的思维理解：Rerank 就是 Comparator，Agentic RAG 是 Controller。

| 维度 | Rerank | Agentic RAG |
|------|--------|-------------|
| 角色 | 排序器 | 调度器 |
| 是否控制流程 | ❌ | ✔️ |
| 是否多轮 | ❌ | ✔️ |
| 是否调用工具 | ❌ | ✔️ |

## 工程架构

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

本质上就是让 LLM 决定怎么做 RAG，而不是写死一条 pipeline。

---

# 三、GraphRAG vs Agentic RAG

| 维度 | GraphRAG | Agentic RAG |
|------|----------|-------------|
| 核心能力 | 结构化知识 | 动态决策 |
| 重点 | 数据结构 | 执行策略 |
| 技术核心 | Graph | Agent Loop |
| 解决问题 | 多跳推理 | 多轮检索 |

它们不是竞争关系：

- GraphRAG 是知识结构增强
- Agentic RAG 是检索策略增强

两者可以组合成完整形态：Agent + Vector + Graph + ES + Rerank。

---

# 四、总结

GraphRAG 让 AI"理解知识之间的关系"，Agentic RAG 让 AI"决定如何获取知识"。

一个典型的演进路径：

```
RAG → Hybrid RAG → GraphRAG → Agentic RAG → Agentic GraphRAG
```

简单来说就是：**GraphRAG 解决"知识怎么组织"，Agentic RAG 解决"知识怎么获取"。**
