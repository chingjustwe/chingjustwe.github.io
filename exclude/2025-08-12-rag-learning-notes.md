---
layout: post
title: RAG 学习笔记
date: 2025-08-12
categories: [AI, Tech]
tags: [RAG, Embedding, VectorDatabase, AI, 学习笔记]
---

## 一、RAG 是什么

RAG（Retrieval-Augmented Generation）= 检索增强生成。

核心流程：

```text
用户问题
   ↓
召回（Retrieval / Recall）
   ↓
相关文档 Chunk
   ↓
LLM 生成答案（Generation）
```

本质上就是两步：**Retrieval**——先找到相关知识，再让大模型基于这些知识生成答案——**Generation**。

---

## 二、Embedding 是什么

### 1. Embedding 模型是什么？

Embedding Model 是一种特殊的神经网络模型，作用就是把**文本转成向量**。

| 模型类型 | 输入 | 输出 |
|---------|------|------|
| LLM | 文本 | 文本 |
| Embedding Model | 文本 | 向量 |

示例：

```text
输入：请假制度
输出：[0.15, -0.33, 0.87, ...]
```

常见维度：768、1024、1536、3072。

---

### 2. Embedding 是训练过程吗？

不是。要区分两个阶段：

1. **训练 Embedding 模型**——由模型厂商完成，耗费大量 GPU 和数据。
2. **使用 Embedding 模型**——在你的 RAG 系统中，把文本转换成向量，这属于推理（Inference）。

创建向量库的过程：

```text
文档 → Chunk 切分 → Embedding 模型 → 向量 → 存入向量数据库
```

不是重新训练模型。

---

### 3. 为什么"语义相近"会导致"向量距离接近"？

因为 Embedding 模型训练的目标就是让**语义越相似，向量越接近**。

模型通过大量文本学到了这些关联：

```text
请假 ≈ 休假
年假 ≈ 带薪休假
```

原理一句话：**一个词的意义，由它经常和谁一起出现决定。**

比如"碗、筷子、餐具、吃饭"这些词经常出现在相似的上下文里，所以它们的向量会靠近。不只是近义词会接近，同领域、强关联、相似语境的词也一样。所以"碗"和"筷子"虽然不是近义词，但向量可能很近。

---

## 三、向量数据库与 ANN

### 1. 为什么需要向量数据库？

向量数据库存的是 **Chunk + Embedding Vector**，并且支持高效的相似度搜索。

### 2. 什么是 ANN？

ANN = **Approximate Nearest Neighbor（近似最近邻搜索）**。目标是**用少量精度损失换取巨大速度提升**。

假如你有 1 亿个向量，挨个比较成本太高。ANN 会建立索引结构来加速搜索。

### 3. 常见 ANN 算法

#### HNSW

全称：**Hierarchical Navigable Small World**

特点：速度快、召回率高、目前最主流。

支持 HNSW 的数据库：**Qdrant**、**Milvus**、**pgvector**。

#### IVF

全称：**Inverted File Index**

思想：先分桶，再在桶内搜索。

特点：构建快、内存占用小、精度通常低于 HNSW。

#### PQ

全称：**Product Quantization**

作用：压缩向量，减少存储和内存占用。适合超大规模数据集，但会损失部分精度。

### 4. 这些配置属于哪一层？

ANN 是**向量数据库**的配置，不是 Embedding 模型的配置。例如：

```sql
CREATE INDEX USING hnsw ...
```

或者：

```yaml
collection:
  hnsw
```

---

## 四、Chunking：为什么它决定 RAG 上限

向量搜索的对象是 **Chunk**，不是整份 PDF。

### 1. Chunk 太小的问题

假如一个 Chunk 只有 50 个字：

```text
需要主管审批
```

缺少上下文，Embedding 表达就很模糊。

### 2. Chunk 太大的问题

如果一个 Chunk 有 5000 字，同时包含请假、报销、考勤三种制度，一个向量表示多个主题，查询时相似度就会被稀释。

### 3. 合理的 Chunk

经验值：

- Chunk 大小：**500~1000 Token**
- Overlap：**50~200 Token**

Overlap 用来避免信息被切断。

### 4. 为什么说"Chunking 决定 RAG 上限"

因为 Embedding 再强，也只能在现有的 Chunk 里搜索。关键信息被切碎或混杂，召回就会失败。

很多企业项目效果差，根因不是模型，而是：

- 文档解析差
- Chunk 切分差
- Metadata 设计差

---

## 五、Recall（召回）与 Rerank（重排序）

### 1. Recall 是什么？

Recall（召回）就是从海量文档中找出可能相关的候选 Chunk：

```text
100万 Chunk → Top100 候选
```

如果正确答案不在候选里，后面的 LLM 再强也没用。

### 2. Rerank（重排序）

#### 为什么需要 Rerank

向量检索（Embedding Recall）擅长快速召回，能从百万级数据中找候选，但排序不一定准确。

举个例子，用户问"如何申请年假？"，召回结果是：

1. 员工考勤制度
2. 员工休假制度
3. 员工报销制度

实际上"员工休假制度"应该排第一，但向量检索没把它排在首位。Rerank 就是来解决这个问题的。

#### RAG 中的位置

```text
用户问题
    ↓
Embedding Recall
    ↓
Top50 Chunk
    ↓
Rerank
    ↓
Top5 Chunk
    ↓
LLM
```

#### 工作原理

Rerank 模型输入 **[Question, Document]** 对，输出一个匹配分数：

```text
[Question]
如何申请年假？

[Document]
员工休假制度...

输出：
0.98
```

分数越高表示越相关，然后按分数重新排序。

#### Embedding 与 Rerank 的区别

| 维度 | Embedding | Rerank |
|------|-----------|--------|
| 架构 | Bi-Encoder | Cross-Encoder |
| 速度 | 快 | 慢 |
| 适合 | 召回 | 精排 |

简单说：**Embedding 负责找候选，Rerank 负责重新排序。**

#### 常见 Rerank 模型

推荐：

- **bge-reranker-v2-m3**
- **bge-reranker-large**
- **jina-reranker-v2**
- **Cohere Rerank**

#### 企业常见架构

小型项目：

```text
Embedding + LLM
```

中大型项目：

```text
Embedding + Rerank + LLM
```

生产环境（标配）：

```text
BM25 + Embedding Recall + Rerank + LLM
```

#### 实践建议

对于中文 RAG 项目，推荐先用 **bge-m3 + bge-reranker-v2-m3** 把召回链路跑通，再考虑更换其他模型。

---

## 六、Hybrid Search（混合检索）

Hybrid Search = **语义检索 + 关键词检索**。

向量搜索擅长语义理解（年假≈休假），关键词搜索擅长精确匹配（ERR_10086、JDK21、配置项）。

BM25 是目前最主流的关键词检索算法，核心思想很简单：**一个词在文档里出现次数越多、在整个语料里越稀有，得分就越高**。大致可以理解为词频乘上逆文档频率的加权结果——某个 Chunk 里出现了多少个查询关键词、出现频率如何，最终算出一个相关性得分。

典型架构：

```text
用户问题
   ├─ BM25 / Keyword Search
   └─ Vector Search
        ↓
      Merge
        ↓
      Rerank
        ↓
      LLM
```

生产环境中几乎是标配。

---

## 七、Embedding 模型对 RAG 的影响

Embedding 模型直接决定召回质量。粗略来说（纯经验）：

| 因素 | 影响占比 |
|------|---------|
| Chunking | 40% |
| Embedding 模型 | 30% |
| Rerank | 20% |
| 向量数据库 | 10% |

### 主流 Embedding 模型

#### OpenAI

- **text-embedding-3-small**
- **text-embedding-3-large**

特点：效果稳定、开箱即用、收费、需联网。

#### BGE 系列（国内常用）

来自 BAAI（北京智源研究院）。常见模型：

- **bge-small-zh**
- **bge-large-zh**
- **bge-m3**

特点：中文效果好、支持本地部署、RAG 场景非常流行。

#### 其他开源模型

- **e5-large-v2**（Microsoft）
- **gte-large**（Alibaba）
- **jina-embeddings-v3**（Jina AI）

### 模型效果如何评估？

常用基准是 **MTEB（Massive Text Embedding Benchmark）**，可以理解为 Embedding 模型的排行榜。但实际项目中，中文知识库、代码文档、运维手册这类场景，往往还得拿自己的数据跑一遍才知道好不好使。

---

## 八、向量数据库：pgvector 还是专业向量库？

### pgvector

本质就是 **PostgreSQL + Vector 类型**。优点：与 Java 技术栈兼容、开发成本低、适合中小规模 RAG。

### Qdrant / Milvus

适合千万级以上向量、高并发检索、复杂过滤与分布式部署的场景。核心优势包括 HNSW 优化、分片与副本、Hybrid Search、Metadata Filter。

### 实践建议

对于 Java 工程师入门 RAG：

1. **先用 pgvector 跑通链路**——Spring Boot + LangChain4j + PostgreSQL + pgvector。
2. 真正理解召回和 Chunking 后，再考虑 Milvus / Qdrant 等专业方案。

---

## 九、Embedding 模型是库还是服务？

两种都可以。

### 服务模式（最常见）

```text
Spring Boot → HTTP → Embedding Service
```

例如：**Ollama**、OpenAI Embeddings API、Jina AI Embeddings API。

### 本地库模式

直接在进程内加载 ONNX / PyTorch 模型推理。适合离线或小规模场景。

### 为什么会提到 Ollama？

因为 Ollama 不仅能运行 LLM，也能运行 Embedding 模型：

```bash
ollama pull bge-m3
ollama embeddings bge-m3 "请假制度"
```

很多本地 RAG 系统会用 Ollama 统一管理：

```text
Ollama
├── qwen3
├── deepseek-r1
├── bge-m3
└── bge-reranker
```

---

## 十、RAG 的整体工程架构（推荐认知）

完整的 RAG 流程需要区分两个阶段：**Indexing（离线构建）** 和 **Query（在线查询）**。

### Indexing 阶段

```text
Document
    ↓
Chunking
    ↓
Embedding
    ↓
Vector DB（ANN: HNSW）
```

这一步是离线的，把文档切碎、转向量、建好索引存入数据库，供后续查询使用。

### Query 阶段

```text
User Query
    ↓
Embedding
    ↓
┌─ Vector Search（ANN） ─┐
│  + Metadata Filter     │  ← Hybrid Search
│  + BM25 / Keyword      │
└─────────┬──────────────┘
          ↓
        Merge
          ↓
        Rerank
          ↓
          LLM
          ↓
        Answer
```

### 各组件职责

- **Chunking**：决定知识是否被正确表达（把长文档切成合适的片段）
- **Embedding 模型**：决定语义地图质量，把文本映射到向量空间
- **ANN（HNSW）**：决定检索速度，建立索引加速近似搜索
- **Metadata Filter**：在搜索时按标签、时间、类型等过滤结果，缩小搜索范围
- **Hybrid Search**：结合语义检索（Vector）和关键词检索（BM25），兼顾语义理解和精确匹配
- **Rerank**：对召回结果重新打分，提升 TopK 精度
- **LLM**：基于检索到的上下文生成最终答案

### 什么是 Metadata Filter？

Metadata 指的是文档的附加属性信息，例如：

- 文档类型（PDF / Word / Markdown）
- 上传时间（2026-01-01）
- 标签（"请假"、"财务"）
- 作者、部门等

在搜索时，可以先按 Metadata 过滤（**pre-filter**）缩小搜索范围，再执行向量搜索；也可以先搜向量再过滤（**post-filter**）。合理利用 Metadata Filter 能显著提升查询效率和精度。

