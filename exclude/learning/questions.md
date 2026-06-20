## 大模型的输入包含哪些部分？

1. instructions
2. prompt
3. context
4. skills
5. mcps
6. ?

- context 是不是就是对话历史
- 大模型具体是怎么对待它们的？如果大模型只是单词接龙，那按我理解上面的所有的都会被统一成是“输入参数”一种类别？
- token 是怎么计算的？上面所有加起来嘛？
- 上下文超出限制了怎么办？
- 举个例子，如果有些用户在 client（如 deepseek app，豆包 app）端从始至终只用一个 session, 于是这个 session 上下文会非常非常长，而且可能涉及到各方面的知识，这时候我们该怎么做？如何优化？
- MoE 是什么，为什么需要 MoE？
- 为什么在 instructions 里面定义角色，规则，输出，会极大提高模型生成结果的准确性？这跟 MoE 有关吗？
- 大模型幻觉如何处理

## coding agent

- 如何让大模型每输出一个字就返回给客户端？而不是 call 一个 api 当所有回答都生成好之后再返回客户端
- agui demo, integration with codecode
- ADK: https://adk.dev/

## AI Agent

**Prompt Engineering**
- 提示词设计原则
- Few-shot / Zero-shot
- Chain of Thought

**Agent 专业技能 (2-3个月)**
- LangChain / LangGraph / DeepAgent
- RAG
- AutoGPT / BabyAGI
- LlamaIndex（RAG）
- Vector Database（Pinecone、Milvus）
- ReAct 框架
- Tool Use / Function Calling
- Memory 系统
- Planning 推理
- AG-UI

## GitHub

CodeCode
LangChainCode
AI Chronicles
