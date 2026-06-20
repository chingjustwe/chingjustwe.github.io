# AI Agent 框架对比：DeepAgents / OpenCode / ADK / Claude Agent SDK / OpenAI Agents SDK

> 整理日期：2026-06-20

## 一、总体定位

| | 性质 | 厂商绑定 | 典型场景 |
|---|---|---|---|
| **DeepAgents** | 轻量库（基于 LangGraph） | 模型无关 | 复刻 Claude Code 式深度单 agent 工作模式 |
| **OpenCode** | 终端产品 + 可拆解底座 | 模型无关，多 provider 是核心卖点 | 终端 AI 编程助手 |
| **Google ADK** | 企业级全生命周期框架 | 强绑定 GCP / Vertex AI（支持第三方模型） | 企业多 agent 系统，需要评估 / 部署 / 可观测性 |
| **Claude Agent SDK** | Claude Code 内核的库化版本 | 强绑定 Anthropic 模型 | 把 Claude Code 同款能力嵌入自有产品/流水线 |
| **OpenAI Agents SDK** | 轻量多 agent 编排库 | 名义模型无关，实为 OpenAI 生态优化 | OpenAI 生态下的生产级多 agent 应用 |

一句话比喻：
- DeepAgents = "造车的零件和图纸"
- OpenCode = "一辆能开的车（底盘也能拆给别人用）"
- ADK = "Google 版的 LangGraph + LangSmith + LangServe 三合一"
- Claude Agent SDK = "Claude Code 本体引擎的库化暴露"
- OpenAI Agents SDK = "四原语（Agent/Tool/Handoff/Guardrail）+ 开箱即用 Tracing 的轻量生产框架"

---

## 二、DeepAgents vs OpenCode

### 1. 本质定位
- **DeepAgents**：开发框架/库（Python，基于 LangGraph），用于快速构建类似 Claude Code 的深度规划、长程任务执行能力的 agent。不是面向终端用户的产品。
- **OpenCode**：开箱即用的终端 AI 编程助手（类似开源版 Claude Code / Cursor CLI），同时底层也可拆出来当框架用。

### 2. Subagent 设计哲学
- **DeepAgents**：通过内置 `task` 工具把子任务派发给 subagent，subagent 拥有独立上下文窗口，核心目的是防止主上下文被污染/撑爆，强调上下文隔离与任务规划的工程化模式（类似 TODO list 状态追踪）。
- **OpenCode**：subagent 更偏角色划分（如 code-reviewer、debugger），可配置各自工具权限和 prompt，调用方式接近"角色派工"，并强调多 provider（主 agent 用贵模型、子任务用便宜模型）。

### 3. 可扩展性方向

| 维度 | DeepAgents | OpenCode |
|---|---|---|
| 扩展方式 | 代码级（Python，自定义中间件、工具、状态 schema） | 配置级 + 插件/工具协议（TS 生态，支持 MCP） |
| 目标用户 | 应用开发者，需嵌入自有产品 | 终端用户 + 想自定义工作流的开发者 |
| 模型支持 | 任何 LangChain 支持的模型 | 原生多 provider 切换是卖点 |
| UI | 无内置 UI，纯后端逻辑 | 自带 TUI（终端界面），体验完整 |

---

## 三、ADK vs DeepAgents

### ADK 有，DeepAgents 没有的

1. **完整生命周期管理**：内置评估框架、原生 Trace/可观测性、一键部署到 Vertex AI Agent Engine（`adk deploy agent_engine`）。DeepAgents 完全不管测试、上线、监控这一层。
2. **正式的多 Agent 类型系统**：区分 LLM Agent（语言模型推理决策）、Workflow Agent（Sequential/Parallel/Loop，不使用 LLM 的纯代码控制流）、Custom Agent。DeepAgents 几乎所有节点都绑定在 LLM 推理循环上，没有将"纯代码控制流 agent"作为一等公民抽象。
3. **Session / Memory / Artifact 三层状态模型 + 托管服务**：Memory 跨会话记住用户信息；Artifact 管理文件/二进制数据；并有真正的托管后端（VertexAIMemoryBankService、SQL 数据库支持）。DeepAgents 的"记忆"基本就是 LangGraph 的 checkpoint/state，没有这种工程化分层。
4. **Plugin（生命周期回调）机制**：可在 agent 工作流各阶段用回调钩子执行自定义代码（日志追踪、策略强制执行）。DeepAgents 中间件机制更轻，没有这种细粒度多阶段钩子体系。
5. **多语言 SDK**：Python、TypeScript、Go、Java、Kotlin 五种语言。DeepAgents 只有 Python（+社区 JS 版）。
6. **Graph-based 工作流运行时（2.0）**：Agent/Tool/Function 作为图节点求值，原生支持自动重试、遥测、Human-in-the-Loop 暂停。DeepAgents 虽底层也是 LangGraph，但 HITL、自动重试需自己接。

### DeepAgents 有，ADK 没有（或非核心强项）的

1. **极简、对单一 agent 心智模型的高保真复刻**：专注复刻 Claude Code 的"规划+TODO追踪+文件工具+子代理隔离"模式，上手心智负担极低。ADK 概念体系（Runner/Event/Session/State/Memory/Artifact/Plugin/Callback/WorkflowAgent...）丰富但学习曲线陡，对"只想要单体深度 agent"的需求是过度设计。
2. **厂商中立、轻量、不依赖云平台**：基于 LangChain/LangGraph，模型无关性与生俱来。ADK 的高价值功能（Memory Bank、Agent Engine 部署、Trace）多半要接 Vertex AI，体验上与 GCP 绑定。
3. **更贴近 coding agent 场景的工具集**：内置工具（文件读写、TODO 规划、子任务派发）直接为编程任务调优。ADK 是通用框架，无任何编程任务的"出厂预设"。
4. **代码量级带来的可读性和可魔改性**：源码体量小，中间件/状态 schema/子代理派发逻辑几乎没有黑盒。ADK 封装层数更多，调试链路更长。

---

## 四、Claude Agent SDK 关键特征

1. **不是通用框架，是 Claude Code 内核的"库化"**：提供和 Claude Code 完全同款的工具、agent 循环、上下文管理，可用 Python/TypeScript 调用。与 DeepAgents 的"重新实现"不同，这是官方把本体引擎直接开放。

2. **Subagent 上下文隔离彻底，但只能两层**：子 agent 上下文全新、不继承父对话；父子唯一通信通道是 Agent 工具调用的 prompt 字符串；父 agent 只收到子 agent 最终消息（原样，但可能被摘要）。**限制**：subagent 不能再派生自己的 subagent（不能递归嵌套），DeepAgents 因图结构理论上可以做更深编排。

3. **支持 subagent 跑在不同模型上**，且有文件系统（`.claude/agents/*.md`）和编程（`AgentDefinition`）两种定义方式，且可与 Claude Code CLI 共享配置——这是独特设计，ADK、OpenAI SDK 都没有。

4. **工具搜索（Tool Search）按需加载**：当 MCP 工具描述占用超过 10% 上下文窗口时自动触发按需加载，最多减少 95% 上下文占用。这是其他四个框架都未专门解决的痛点。

5. **Hooks 体系细到工具调用级别**：PreToolUse、PostToolUse、Stop、SessionStart、SessionEnd、UserPromptSubmit 等，可绑定具体工具（如 Edit/Write 后自动记审计日志）。

6. **明显缺失**：没有内置评估框架，没有托管部署，没有正式的长期 memory/session 服务——本质是"运行时库"，这些都要自己接。

---

## 五、OpenAI Agents SDK 关键特征

1. **核心抽象是 Handoff（控制权转移），不是任务派发**：四原语为 Agent、Tools、Handoffs、Guardrails。Handoff 转移的是循环的控制权——不是会返回结果的函数调用，一旦交接，新 agent 完全接管对话（也支持 "Agents as tools" 的派遣式用法作为可选项）。

2. **Guardrail 是一等公民，输入输出分段、并行执行**：未通过检查会触发 tripwire，立即抛出异常并停止执行；多 agent 通过 handoff 链式调用时，输入 guardrail 只作用于第一个 agent，输出 guardrail 只作用于产出最终结果的 agent。

3. **Tracing 仪表盘开箱即用**：自动收集 LLM 生成、工具调用、handoff、guardrail 等完整事件记录，配合 platform.openai.com 的 Traces 面板做调试。在 LLM 调用链路的即时可视化上体验接近 ADK，但 ADK 的观测体系更完整（含 evaluation framework、deployment telemetry），而 OpenAI 的 Tracing 作为轻量库自带已属突出。

4. **Sessions 较为朴素**：提供跨 agent 运行的自动对话历史管理，精细度远不如 ADK 的四层体系（Session/State/Memory/Artifact）。

5. **名义 provider-agnostic，实际生态最贴 OpenAI**：支持 Responses/Chat Completions API 及 100+ 其他 LLM，但专为 OpenAI API 打造，原生支持 function calling、结构化输出、流式传输，无需额外抽象层。

---

## 六、Subagent / 任务委派机制：三种设计哲学

| 模式 | 代表 | 核心特征 | 卖点 |
|---|---|---|---|
| **派遣-汇报（Dispatch & Report）** | DeepAgents 的 `task` 工具<br>Claude Agent SDK 的 `Agent`（作为 Tool） | 父 agent 始终在场，子 agent 做完汇报，父 agent 决定下一步 | 上下文隔离 |
| **接力（Handoff / Control Transfer）** | OpenAI Agents SDK 的默认 Handoff | 控制权彻底转移，新 agent 接管整个对话，原 agent 退场 | 职责边界清晰 |
| **图节点（Graph Node / Workflow Agent）** | ADK 2.0 graph-based 运行时 | Agent/Tool/Function 都是图节点；支持 LLM 驱动转移 + 显式 AgentTool 委派；可混入不调用模型的 Workflow Agent | 确定性 + 灵活性并存（但概念最多最重）|

---

## 七、一句话总结

| 框架 | 一句话定位 |
|---|---|
| **DeepAgents** | 轻、可读、模型无关，复刻 Claude Code 心智模型，适合实验性/自定义项目 |
| **OpenCode** | 终端可直接用的产品，多 provider 是亮点，subagent 偏角色化分工 |
| **Google ADK** | 企业全生命周期框架，概念最全最重，强绑定 GCP 但功能最完整（评估+部署+观测+多层记忆） |
| **Claude Agent SDK** | Claude Code 本体内核的库化版本，subagent 隔离最彻底但只能两层，工具按需加载是独门武器，强绑定 Anthropic |
| **OpenAI Agents SDK** | 四原语清晰、Handoff 范式独特、Guardrail 和 Tracing 开箱即用，轻量库与生产可观测性平衡最好，生态强绑定 OpenAI |

---

## 八、选型建议方向

- **必须模型无关、要自己魔改控制每个环节** → DeepAgents
- **要一个终端能直接用的编程助手，且想灵活换模型** → OpenCode（其底层也可拆出来当框架用，但该模式目前成熟度低于 DeepAgents 的纯库化设计）
- **企业级、需要评估/部署/可观测性/多语言团队协作** → ADK
- **要把 Claude Code 同款能力嵌入产品，且已绑定 Anthropic 模型** → Claude Agent SDK
- **OpenAI 生态为主，需要清晰的 handoff 范式 + 开箱即用 tracing/guardrail** → OpenAI Agents SDK

*注：本文基于截至 2026 年 6 月的公开资料整理，各项目更新较快，建议关键决策前回查官方文档确认最新细节。*