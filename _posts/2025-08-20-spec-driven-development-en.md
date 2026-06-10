---
layout: post
title: "What Is Spec-Driven Development?"
date: 2025-08-20
categories:
  - Tech
tags:
  - Spec-Driven Development
  - Architecture
  - Design Patterns
---

Everyone uses the word "Spec." OpenAPI is a spec. Protobuf is a spec. Kubernetes even has a dedicated `spec` field. But what is a spec, really?

## One Sentence

> **A Spec (Specification) is a model that defines a system contract, independent of any specific implementation.**

It describes what the system should do, not how to do it.

## The Core

A spec boils down to three things:

- **Contract** — both sides must agree. Your interpretation and mine should match.
- **Behavior** — describes what the system does on the outside, not how it works inside.
- **Expected** — defines how things *should* be, not how they *actually* are.

In plain terms: decide what the system should look like first, then write the code.

## Why OpenAPI, Protobuf, and Kubernetes Are All Specs

**OpenAPI** defines an interface contract:

```yaml
GET /users/{id}
```

**Protobuf** defines a data structure contract:

```proto
message User {
  int64 id = 1;
  string name = 2;
}
```

**Kubernetes** defines a desired state:

```yaml
spec:
  replicas: 3
```

They all do the same thing: describe *what you want*, not *how to get there*.

## Spec Does Not Care About Implementation

Say a spec states:

```yaml
amount >= 100 => free_shipping
```

The implementation could be an if/else, a strategy pattern, a rule engine, or even a paper checklist. A spec only cares about the outcome, not the path.

## Common Categories of Specs

Most specs fall into these categories:

- **Interface Spec**: what the API looks like (OpenAPI, gRPC)
- **Data Spec**: what the data structure is (Protobuf, JSON Schema)
- **Behavior Spec**: what the business rules are (business logic, state machines)
- **State Spec**: what the final state should be (Kubernetes)
- **Infrastructure Spec**: how the infrastructure is set up (Terraform, Docker Compose)
- **Protocol Spec**: how two parties communicate (HTTP, WebSocket)

## What Is Kubernetes' `spec` Field, Really?

A lot of people think `spec:` in a Deployment is itself the Spec. Not quite.

The entire Deployment YAML — `apiVersion`, `kind`, `metadata`, `spec`, all of it together — is the Specification. `spec:` is just one field inside it, specifically for describing the desired state.

Kubernetes is a textbook Spec-Driven system. You tell it "I want 3 replicas" and it figures out the rest.

## Spec vs Configuration

| Configuration | Specification |
|--------------|--------------|
| Input parameters | Contract |
| Tells the system *how* to run | Tells the system *what* to become |
| Implementation-oriented | Goal-oriented |

Configuration says "how." Spec says "what it should look like."

## The Biggest Challenge in Spec-Driven Development

The problem: different people write specs in different formats.

Some use YAML, some JSON, some Protobuf. Even when everyone uses YAML, the structure can vary wildly.

The fix is straightforward:

> **Define not only the Spec, but also the Spec Schema.**

For example, a team might mandate that every spec must follow this structure:

```yaml
feature:
  rules:
  validation:
  examples:
```

Use a Schema to constrain the Spec. Otherwise the spec itself becomes a source of confusion.

## Why Spec Matters Even More in the AI Era

Traditional development:

```
Requirements → Human → Code
```

AI-driven development:

```
Requirements → LLM → Code
```

LLMs tolerate vague requirements far worse than humans do. When requirements are unclear, the LLM guesses, and guessing means mistakes. A structured Spec gives the LLM a safety net — it spells out the rules and boundaries.

## Relationship with DDD

Writing this article, I thought about DDD. They complement each other:

- **DDD** cares about how business concepts are modeled.
- **Spec-Driven Development** cares about how system behavior is precisely defined.

Think of it this way:

```
DDD → Domain Model
Spec → Behavioral Constraints
```

DDD gives you the right conceptual model. Spec gives you the precise behavioral boundaries. You really want both.

## The Final Picture

```
Code = Implementation
Spec = Contract
Configuration = Parameters
Documentation = Explanations
```

A spec is not a fixed format. OpenAPI, Proto, GraphQL, Kubernetes — they are all called Specifications for the same reason: they define a contract that the system must obey. Once you understand that, you've got the core of Spec-Driven Development.
