# s05: Skills

> **格言**: *"Load knowledge when you need it, not upfront"*
> **Harness 层**: On-demand Knowledge——按需加载的领域专业知识

## 解决的问题

希望 agent 遵循领域特定的工作流：git 规范、测试模式、代码审查清单。把所有东西塞进 system prompt 会在无用技能上浪费 token。10 个技能每个 2000 token = 20000 token，其中大部分对当前任务无关。

## 解决方案

**两层架构**：

```
System prompt (Layer 1 -- always present):
+--------------------------------------+
| You are a coding agent.              |
| Skills available:                    |
|   - git: Git workflow helpers        |  ~100 tokens/skill
|   - test: Testing best practices     |
+--------------------------------------+

When model calls load_skill("git"):
+--------------------------------------+
| tool_result (Layer 2 -- on demand):  |
| <skill name="git">                   |
|   Full git workflow instructions...  |  ~2000 tokens
|   Step 1: ...                        |
| </skill>                             |
+--------------------------------------+
```

Layer 1: skill **名称** 在 system prompt 中（便宜）。
Layer 2: 完整**正文**通过 tool_result 注入（昂贵，按需）。

## 代码要点

1. **每个 skill 是一个包含 SKILL.md 的目录**，带 YAML frontmatter：

```
skills/
  pdf/
    SKILL.md       # ---\n name: pdf\n description: Process PDF files\n ---\n ...
  code-review/
    SKILL.md       # ---\n name: code-review\n description: Review code\n ---\n ...
```

2. **SkillLoader** 扫描 SKILL.md 文件，用目录名为 skill 标识符：

```python
class SkillLoader:
    def __init__(self, skills_dir: Path):
        self.skills = {}
        for f in sorted(skills_dir.rglob("SKILL.md")):
            text = f.read_text()
            meta, body = self._parse_frontmatter(text)
            name = meta.get("name", f.parent.name)
            self.skills[name] = {"meta": meta, "body": body}

    def get_descriptions(self) -> str:
        lines = []
        for name, skill in self.skills.items():
            desc = skill["meta"].get("description", "")
            lines.append(f"  - {name}: {desc}")
        return "\n".join(lines)

    def get_content(self, name: str) -> str:
        skill = self.skills.get(name)
        if not skill:
            return f"Error: Unknown skill '{name}'."
        return f"<skill name=\"{name}\">\n{skill['body']}\n</skill>"
```

3. **注入机制**：Layer 1 进 system prompt，Layer 2 是另一个 tool handler：

```python
SYSTEM = f"""You are a coding agent at {WORKDIR}.
Skills available:
{SKILL_LOADER.get_descriptions()}"""

TOOL_HANDLERS = {
    "load_skill": lambda **kw: SKILL_LOADER.get_content(kw["name"]),
}
```

模型知道有什么技能可用（便宜），在相关时加载它们（昂贵）。

## 关键洞察

- 这是**上下文效率**的关键模式：不要把百科全书包在 prompt 里，让模型在需要时自己查
- 通过 `tool_result` 注入比 system prompt 注入更"靠近"当前推理——模型刚决定要这个知识，立即就看到
- Skill 只是 SKILL.md 文件——非工程师也可以编写

## 变化总结

| 组件 | 之前 (s04) | 之后 (s05) |
|------|-----------|-----------|
| Tools | 5 (base + task) | 5 (base + load_skill) |
| System prompt | 静态字符串 | + skill descriptions |
| Knowledge | 无 | skills/*/SKILL.md 文件 |
| 注入方式 | 无 | 两层（system + result）|

## 我的理解

Skill loading 实现了"知识的按需分页"——类似操作系统的虚拟内存。系统只保留"目录"（skill 名称和描述），实际内容在缺页（调用 `load_skill`）时加载。这种模式在知识量不断增长时尤其重要。每个 SKILL.md 就像一个可插拔的知识模块，模型决定什么时候需要。
