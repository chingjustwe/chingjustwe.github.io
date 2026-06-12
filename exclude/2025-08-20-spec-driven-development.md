---
layout: post
title: "Spec-Driven Development 中的 Spec 到底是什么"
date: 2025-08-20
categories:
  - Tech
tags:
  - Spec-Driven Development
  - 架构
  - 设计模式
---

Spec 这个词人人都用。OpenAPI 是 Spec，Protobuf 也是 Spec。Kubernetes 甚至专门有一个 `spec` 字段。但 Spec 到底是什么？

## 一句话

**Spec（Specification）是一种脱离具体实现、用于定义系统契约（Contract）的模型。**

它描述系统应该做什么（What），而不是如何实现（How）。

## 核心

Spec 的核心是三样东西：

- **Contract（契约）**：双方都得遵守，不能你理解一套我理解一套
- **Behavior（行为）**：描述系统对外表现，不关心内部怎么实现
- **Expected（期望）**：定义"应该怎样"，而不是"实际上怎样"

说白了就是：你先说好系统应该长什么样，再去写代码。

## 为什么 OpenAPI、Proto、Kubernetes 都是 Spec

**OpenAPI** 定义接口契约：

```yaml
GET /users/{id}
```

**Protobuf** 定义数据结构契约：

```proto
message User {
  int64 id = 1;
  string name = 2;
}
```

**Kubernetes** 定义目标状态：

```yaml
spec:
  replicas: 3
```

它们都在做同一件事：描述"你要什么"，而不是"怎么实现"。

## Spec 不关心实现

举个例子，Spec 写的是：

```yaml
amount >= 100 => free_shipping
```

实现可以是 if/else、策略模式、规则引擎，甚至是一份纸质清单。Spec 只管结果，不管过程。

## Spec 的常见分类

其实所有 Spec 都可以归到这几类：

- **Interface Spec**：接口长什么样（OpenAPI、gRPC）
- **Data Spec**：数据结构是什么（Protobuf、JSON Schema）
- **Behavior Spec**：行为规则是什么（业务规则、状态机）
- **State Spec**：系统最终应该是什么状态（Kubernetes）
- **Infrastructure Spec**：基础设施怎么搭（Terraform、Docker Compose）
- **Protocol Spec**：双方怎么通信（HTTP、WebSocket）

## Kubernetes 的 spec 字段到底是什么

很多人以为 Deployment 里的 `spec:` 字段就是 Spec。其实不太对。

整个 Deployment YAML，包括 `apiVersion`、`kind`、`metadata`、`spec` 全部加在一起，才是一个完整的 Specification。`spec:` 只是里面的一个字段，专门用来描述期望状态（Desired State）。

换句话说，Kubernetes 本身就是一个典型的 Spec-Driven 系统。你告诉它"我要 3 个副本"，它自己想办法搞定。

## Spec 和 Configuration 的区别

| Configuration | Specification |
|--------------|--------------|
| 输入参数 | 契约 |
| 告诉系统如何运行 | 告诉系统应该是什么样 |
| 偏实现 | 偏目标 |

配置告诉你"怎么做"，Spec 告诉你"做成什么样"。

## Spec-Driven Development 最大的挑战

问题是：不同的人会写出不同格式的 Spec。

有人写 YAML，有人写 JSON，有人写 Protobuf。即使都用 YAML，结构也可以完全不一样。

解法也很直接：

> **不仅定义 Spec，还要定义 Spec Schema。**

比如团队统一规定所有 Spec 必须按这个结构来：

```yaml
feature:
  rules:
  validation:
  examples:
```

用 Schema 把 Spec 约束住，否则 Spec 本身又变成了混乱的源头。

## AI 时代为什么尤其需要 Spec

传统的开发流程是：

```
需求 → 人 → 代码
```

AI 开发流程是：

```
需求 → LLM → 代码
```

LLM 对模糊需求的容忍度比人低得多。如果需求不明确，LLM 会猜，猜就会错。结构化 Spec 的作用就是给 LLM 一颗定心丸，告诉它规则是什么、边界在哪里。

## 和 DDD 的关系

写这篇文章的时候我想到了 DDD，它俩其实是互补的：

- **DDD** 关心的是"业务概念怎么建模"
- **Spec-Driven Development** 关心的是"系统行为怎么精确定义"

你可以这样理解：

```
DDD → 领域模型
Spec → 行为约束
```

DDD 给你正确的概念模型，Spec 给你精确的行为边界。缺一个都不太稳。

## 最终理解

```
代码 = 实现（Implementation）
Spec = 契约（Contract）
配置 = 参数（Configuration）
文档 = 说明（Documentation）
```

Spec 不是某种固定格式。OpenAPI、Proto、GraphQL、Kubernetes 都可以叫 Specification，因为它们都在定义系统必须遵守的契约。理解了这一点，你就抓住了 Spec-Driven Development 的核心。
