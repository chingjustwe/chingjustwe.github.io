# OpenCode AI Agent 深度解析：Agent 之间的本质区别

## 背景

OpenCode 原生内置了两个 Primary Agent：**Build** 和 **Plan**。它们的核心区别表面上看起来只是"权限不同"，但这只是冰山一角。

## Agent 的完整配置维度

一个 Agent 是由以下多个维度共同定义的实体，而非仅仅是"有某些权限的角色"：

| 维度 | 说明 | 示例 |
|------|------|------|
| **prompt / system prompt** | 定义 agent 的角色、专业领域知识、行为准则 | `"You are a security expert..."` |
| **model** | 指定使用的 LLM 模型，可按任务需求选择不同模型 | `opencode/deepseek-v4-flash-free` |
| **permission** | 控制每个工具/命令的 allow / ask / deny | `{ "edit": "deny", "bash": { "npm audit": "allow" } }` |
| **mode** | primary（Tab 切换）或 subagent（@提及） | `"primary"` / `"subagent"` |
| **temperature** | 控制输出的创造性与确定性 | `0.1`（严谨）~ `0.8`（创意） |
| **max steps** | 限制 agent 迭代次数，控制成本 | `steps: 5` |
| **description** | 为 subagent 提供描述，方便 LLM 自动选择合适的 agent | `"Performs security audits"` |
| **color** | 界面中的视觉区分 | `"#ff6b6b"` |
| **hidden** | 是否在 @ 菜单中显示 | `true` |
| **tools / MCP** | 控制可使用的工具集（可集成外部 MCP server） | 通过 permission 控制 |

## Build vs Plan 对比

| 特性 | Build | Plan |
|------|-------|------|
| **mode** | primary | primary |
| **权限策略** | `edit: allow`, `bash: allow` | `edit: ask`（需确认）, `bash: ask` |
| **适用场景** | 直接开发、改代码 | 分析代码、审查、制定计划 |
| **prompt** | 默认（无自定义） | 默认（无自定义） |

它们本质上是同一个通用 agent 的两个"权限预设"，没有自定义的 domain knowledge。

## 真正的 Agent 差异化案例

一个有领域知识的 Agent 应该是这样的组合：

```json
{
  "agent": {
    "security-audit": {
      "mode": "subagent",
      "model": "opencode/deepseek-v4-flash-free",
      "description": "Performs security audits on codebase",
      "prompt": "You are a security expert. Focus on identifying vulnerabilities including:
- Input validation flaws
- Authentication/authorization issues
- Data exposure risks
- Dependency vulnerabilities
- Configuration security issues

Provide actionable fix suggestions for each finding.",
      "temperature": 0.1,
      "permission": {
        "read": "allow",
        "grep": "allow",
        "bash": { "*": "deny", "npm audit": "allow", "snyk *": "allow" },
        "edit": "deny",
        "webfetch": "allow"
      }
    }
  }
}
```

## Primary Agent vs Subagent

| 特性 | Primary | Subagent |
|------|---------|----------|
| **切换方式** | Tab 键切换 | 在对话中用 `@agent-name` 提及 |
| **调用方式** | 直接交互 | 可被 primary agent 自动调用，或手动 @ |
| **典型用途** | 主对话 | 专项任务（代码审查、文档编写等） |

## 创建 Agent 的方式

1. **交互式命令**：`opencode agent create`
2. **opencode.json 配置**：
   ```json
   { "agent": { "my-agent": { "mode": "subagent", ... } } }
   ```
3. **Markdown 文件**：放在 `~/.config/opencode/agents/` 或 `.opencode/agents/` 下

## 适用范围说明

本文描述的 Agent 概念和配置方式是 **OpenCode 特有的**。不同 AI 工具中的 Agent 设计理念有共通之处，但实现方式完全不同：

| 概念 | OpenCode | Cursor | Claude Code | Copilot (VS Code) |
|------|----------|--------|-------------|-------------------|
| **Agent 定义** | JSON/MD 配置文件 | Rules (.cursorrules) | Claude Code 自身就是 agent | 无自定义 agent 概念 |
| **自定义 prompt** | 每个 agent 独立的 prompt 字段 | 全局 rules 文件 | 通过 CLI 参数或文件 | 无 |
| **权限控制** | 细粒度 per-command | 无 | 内置权限校验 | 无 |
| **subagent 机制** | @提及 + 自动调度 | 无 | 无 | 无 |
| **模型切换** | 每个 agent 独立指定 | 全局模型 | 全局模型 | 全局模型 |

### 通用趋势

尽管实现不同，但所有 AI 编程工具的 Agent 设计**共享一些共同趋势**：
- prompt/instruction 是核心差异化手段
- 权限/安全控制越来越重要
- 工具调用（MCP/API）正在成为标配
- agent 专业化分工（分析、编码、审查等）是发展方向

## 总结

Agent 的真正差异化在于 **prompt（领域知识） + model + permissions + tools 的组合配置**，而非仅仅是权限。Build 和 Plan 只是最简单的示例，真正的威力来自于根据任务需求自定义 prompt 和工具集。

> 注意：本文的配置语法和机制仅适用于 OpenCode。
