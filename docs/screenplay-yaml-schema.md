# 🎬 Novel2Story 剧本 YAML Schema 文档

> 版本：1.0.0 | 最后更新：2026-06-05
> Novel2Story — AI 小说转剧本工具的底层数据格式定义

---

## 目录

1. [设计目标](#设计目标)
2. [为什么用 YAML](#为什么用-yaml)
3. [Schema 总览](#schema-总览)
4. [元数据 (Metadata)](#元数据-metadata)
5. [角色 (Character)](#角色-character)
6. [幕 (Act)](#幕-act)
7. [场景 (Scene)](#场景-scene)
8. [场景元素 (Element)](#场景元素-element)
9. [完整示例](#完整示例)
10. [设计决策 FAQ](#设计决策-faq)
11. [与其他格式的映射](#与其他格式的映射)

---

## 设计目标

这套 Schema 的设计有四个核心目标：

| 目标 | 说明 |
|------|------|
| **语义保真** | 剧本格式不是小说的"简化"，而是一种语义转换。Schema 保留了原小说的叙事结构（章节→幕），同时映射到标准剧本元素（场景、对白、动作）。 |
| **人类可编辑** | 编剧需要能在文本编辑器中直接修改剧本——不需要专业软件。 |
| **工具链友好** | 可双向转换为 Fountain、FDX、PDF 等标准剧本格式。 |
| **渐进增强** | 从"只有文本"到"完整剧本"的过渡过程中，所有中间状态都是合法的 Schema。 |

---

## 为什么用 YAML

| 格式 | 人类可读 | 结构化 | 可互操作 |
|------|---------|--------|---------|
| YAML | ✅✅ | ✅ | ✅✅ |
| JSON | ❌（括号地狱） | ✅✅ | ✅✅ |
| XML | ❌ | ✅✅ | ✅✅ |
| Fountain | ✅✅ | ❌（纯文本） | ❌ |
| TOML | ✅✅ | ✅ | ⚠️ |

**结论：YAML 在"人类编写体验"和"机器处理能力"之间取得了最佳平衡。**

具体优势：
- 用缩进表示层级，比括号和标签更自然
- 支持注释（`#`），编剧可以在剧本中写备注
- 支持多行字符串（`>-`）——动作描述经常跨行
- Python/JavaScript/Ruby 都有原生或高质量的 YAML 库

---

## Schema 总览

```yaml
screenplay:
  title:        "剧本标题"          # string, required
  author:       "作者"              # string
  source:       "来源小说"           # string
  sourceChapters: 3                # integer, required
  createdAt:    "2026-06-05"       # string (date), required
  version:      "1.0.0"           # string, required

  characters:   [Character]        # 角色表, required
  acts:         [Act]              # 幕列表, required
```

---

## 元数据 (Metadata)

```yaml
title: "意外的访客"         # 剧本标题。默认取输入的小说题目。
author: "小明"               # 作者名，从元信息获取。
source: "原创"              # 来源小说名称。
sourceChapters: 3          # 输入的小说章节数量（≥1 即可）。
createdAt: "2026-06-05"    # 生成日期，格式 YYYY-MM-DD。
version: "1.0.0"           # Schema 版本号，用于向后兼容。
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `title` | string | ✅ | 剧本标题，取自动检测或输入 |
| `author` | string | — | 作者 |
| `source` | string | — | 来源小说 |
| `sourceChapters` | integer | ✅ | 小说章节数（≥1），用于估算转换工作量 |
| `createdAt` | date | ✅ | ISO 日期，格式 `YYYY-MM-DD` |
| `version` | string | ✅ | Schema 版本语义化版本号 |

**设计原因：** 元数据是所有剧本文件的基本身份信息。`sourceChapters` 是 Novel2Story 特有的字段——它记录了输入规模，帮助用户和工具了解这个剧本是由多少章节的小说改编而来。

---

## 角色 (Character)

```yaml
characters:
  - id: "char_001"
    name: "李明"
    alias: ["小李"]
    description: "28岁，程序员，性格内向但关键时刻会挺身而出。"
    role: protagonist
    arc: "从被动接受到主动抗争"
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 唯一标识，格式 `char_{三位编号}`。通过 ID 被场景和对话引用。 |
| `name` | string | ✅ | 角色显示名。对话元素中通过此名查找角色。 |
| `alias` | string[] | — | 别名/昵称。角色在小说中可能有多个称呼，alias 用于匹配。 |
| `description` | string | — | 角色描述：年龄、外貌、性格等。给编剧的创作参考。 |
| `role` | enum | ✅ | 角色定位：`protagonist`, `antagonist`, `supporting`, `minor` |
| `arc` | string | — | 角色弧光/成长线描述。对编剧创作关键情节线至关重要。 |

**设计原因：**

- **用 `id` 而非直接名字引用**：一个角色可能有多个称呼（本名、外号、特定场合称呼）。用 id 引用可以在不修改所有关联数据的前提下更改显示名。AI 生成时，名字同音不同字的问题也更容易处理。

- **`total.role` 枚举**：标准剧本需要区分角色重要性，这影响很多工具行为（如台词统计、角色线图的绘制）。

- **`arc` 字段可选**：角色弧光是小说的核心叙事驱动力，但很多剧本初稿阶段演员表还没完善。允许为空可以减少初稿门槛。

---

## 幕 (Act)

```yaml
acts:
  - id: "act_001"
    title: "第一章 意外的访客"
    summary: "李明接到警察电话，得知父亲二十年前的失踪线索。"
    scenes: [Scene...]
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 唯一标识，格式 `act_{三位编号}` |
| `title` | string | ✅ | 幕标题。默认映射为小说章节名。 |
| `summary` | string | — | 幕的剧情概括。由 AI 自动生成。 |
| `scenes` | Scene[] | ✅ | 场景列表，至少含 1 个场景。 |

**设计原因：**

- **幕 = 小说章节的映射**：多数中文小说采用章回体结构。将每一章映射为一幕（Act）是最自然的改编方式。编剧可以后续合并或拆分。

- **summary 字段**：由 AI 自动生成的幕摘要，帮助编剧快速理解每一幕的核心内容，在精修阶段提供上下文。

- **scenes 非空约束**：一个空场景列表意味着数据不完整，应在导入阶段就做校验。

---

## 场景 (Scene)

```yaml
scenes:
  - id: "scn_001_001"
    heading: "INT. 客厅 - 清晨"
    location: "客厅"
    time: "清晨"
    summary: "李明在家工作，接到林警官电话。"
    characters: ["char_001", "char_002"]
    elements: [Element...]
```

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 格式 `scn_{幕编号}_{场景编号}`。 |
| `heading` | string | ✅ | 标准剧本场景标题（Slug Line）。格式：`[INT./EXT.] 地点 - 时间`。 |
| `location` | string | — | 从文本提取的场景地点。 |
| `time` | string | — | 从文本提取的时间段。 |
| `summary` | string | — | 场景概要。帮助编剧快速了解场景内容。 |
| `characters` | string[] | — | 本场景出现的角色 ID 列表。 |
| `elements` | Element[] | ✅ | 场景内的叙事元素（动作、对白、转场）。 |

**设计原因：**

- **heading 格式对标标准剧本**：`INT./EXT. 地点 - 时间` 是全球通用的剧本格式。即使 AI 生成的 heading 不够精确（如 `INT. 客厅 - 清晨` 中的"清晨"不够具体），编剧也能立即理解并修正。

- **location/time 与 heading 冗余存在**：heading 是最终呈现格式，location/time 是从文本中提取的原始信息。冗余设计让工具可以在不重写 heading 的前提下修改地点或时间。

- **characters 数组**：列出场景中的角色 ID，便于编剧快速了解谁在此场景中出场。工具也可以用这个字段做角色台词量统计。

---

## 场景元素 (Element)

```yaml
elements:
  - type: action
    content: "阳光透过窗帘的缝隙洒进客厅。"

  - type: dialogue
    character: "char_001"
    parenthetical: "叹气"
    content: "这个bug我改了一整天……"

  - type: transition
    content: "CUT TO:"
```

### 元素类型说明

#### action — 动作/描写

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `type` | string | ✅ | 固定为 `action` |
| `content` | string | ✅ | 动作描述文本。支持多行（YAML `>-` 块）。 |

**映射关系：** 小说中的大多数叙事段落、环境描写、人物动作用于 → `action` 元素。

**准则：** 剧本里的 action 只写"看得见、听得见"的东西。"他感到不安" → ❌，"他搓着手来回踱步" → ✅。

**设计原因：** action 元素不设角色字段，因为动作不是对白。多行文本适配 YAML 的 `>-` 折叠风格。

---

#### dialogue — 对白

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `type` | string | ✅ | 固定为 `dialogue` |
| `character` | string | ✅ | 说话角色的 ID。引用 `characters[].id`。 |
| `content` | string | ✅ | 对白文本。 |
| `parenthetical` | string | — | 语气/动作指示（通常用括号包裹）。如"低声"、"叹气"、"愤怒地"。 |

**映射关系：** 小说中的直接引语、对话、独白 → `dialogue` 元素。

**设计原因：**
- `character` 引用 id 而非名字：同上，便于统一修改角色名。
- `parenthetical` 可选且独立：不是所有对白都需要语气指示，由 AI 智能判断是否提取。
- 不对 content 做长度限制。长独白（如莎士比亚风格）在剧本中确实存在。

---

#### transition — 转场

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `type` | string | ✅ | 固定为 `transition` |
| `content` | string | ✅ | 转场指示。如 `CUT TO:`、`FADE OUT.`、`DISSOLVE TO:`。 |

**映射关系：** 小说中的"与此同时"、"另一面"、"时间回到"等时空切换标记 → `transition` 元素。

**设计原因：** 转场在小说中多通过段落空行或过渡词暗示。将其显式化为 transition 元素，可以帮助编剧理解场景间的逻辑关系，在精修时决定保留或移除特定转场。

---

## 完整示例

```yaml
screenplay:
  title: "意外的访客"
  author: "佚名"
  source: "原创"
  sourceChapters: 3
  createdAt: "2026-06-05"
  version: "1.0.0"

  characters:
    - id: "char_001"
      name: "李明"
      alias: []
      description: "28岁，程序员"
      role: protagonist
      arc: "从被动接受到主动抗争"
    - id: "char_002"
      name: "林晓"
      alias: []
      description: "约30岁，警官"
      role: antagonist
      arc: ""

  acts:
    - id: "act_001"
      title: "第一章 意外的访客"
      summary: "李明接到警察电话，得知父亲二十年前的失踪线索。"
      scenes:
        - id: "scn_001_001"
          heading: "INT. 客厅 - 清晨"
          location: "客厅"
          time: "清晨"
          summary: ""
          characters: ["char_001", "char_002"]
          elements:
            - type: action
              content: "阳光透过窗帘的缝隙洒进客厅。李明坐在电脑前，盯着屏幕。他已经连续工作了十二个小时。"
            - type: dialogue
              character: "char_001"
              parenthetical: "叹气"
              content: "这个bug我改了一整天……"
            - type: action
              content: "突然，手机震动。李明看了一眼来电显示，是一个陌生号码。"
            - type: dialogue
              character: "char_001"
              parenthetical: "声音沙哑"
              content: "喂？"
            - type: dialogue
              character: "char_002"
              content: "是李明先生吗？我是林警官，有件重要的事情需要和你当面谈谈。"
            - type: dialogue
              character: "char_001"
              content: "什么事？"
            - type: dialogue
              character: "char_002"
              content: "关于你父亲的事。方便的话，我现在过来。"
```

---

## 设计决策 FAQ

### Q: 为什么用 `id` 引用角色而不是直接用名字？

**A:** 一个角色可能有多个称呼——本名、外号、特定场合的称呼（比如"师父"）。用 id 引用可以在不改变所有对白引用的前提下修改角色名。AI 生成阶段，名字同音不同字的情形也很常见（"王芳"/"王方"），用 id 去重更可靠。

### Q: 为什么场景元素用数组而不是嵌套结构？

**A:** 剧本本质上是顺序文本——动作和对白交替出现，构成一个线性的叙事流。数组忠实于剧本的线性本质，也更容易在编辑器中进行拖拽排序。如果采用嵌套结构（如 `{ action: [...], dialogue: [...] }`），将丢失元素间的交错顺序。

### Q: 为什么不直接用 Fountain 或 FDX？

**A:**

- **Fountain** 是纯文本标记格式，优点是人类可写，缺点是无法直接提取结构化信息（比如"帮我统计林晓在这场戏的台词字数"）。解析 Fountain 需要额外的解释器。

- **FDX (Fade In XML)** 是 XML 格式，Full Studio 和 Fade In 的导出格式。XML 具备机器可分析性，但人类用文本编辑器修改 XML 是噩梦。

- **YAML** 结合了可读性和结构化。一个编剧用 VS Code 或 Notepad 就能直接编辑 YAML 剧本。

### Q: 信息丢失了怎么办？小说里很多细节在剧本里用不上。

**A:** 小说改编剧本有一个核心理念：**Show, don't tell（展示，不要告诉）**。剧本只记录"看得见、听得见"的东西——角色做了什么、说了什么、场景是什么样的。
心理描写（"他感到恐惧"）、抽象叙事（"日子一天天过去"）等确实会"丢失"。但这是改编的本质——不是丢失，是转译。
小说是内省的艺术，剧本是外显的艺术。这种"丢失"正是工具的价值所在——它自动完成了从"内省"到"外显"的转换。

### Q: 为什么 action 和 dialogue 不共用字段结构？

**A:** 它们在剧本中是完全不同的元素类型。dialogue 需要关联角色和语气指示，而 action 不需要。强制统一会导致 dialogue 元素中出现空洞的 content-only 结构。三种元素类型（action/dialogue/transition）用 `type` 区分，比每个元素都塞满字段更清晰。

### Q: 如何处理心理描写和内心独白？

**A:** Schema 通过两种方式处理：

1. **转化为 action**：可外化的心理活动（"他决定离开"）→ 动作描述（"他起身走向门口"）。
2. **转化为 dialogue** 标记 `(V.O.)`：内心独白可以作为画外音对话，在 `parenthetical` 中标注 `"V.O."`。

后续版本可能增加 `monologue` 类型更明确地表示内心戏。

### Q: 版本号 `version` 怎么用？

**A:** Novel2Story Schema 的版本遵循 SemVer 规范：

- **主版本号**：不兼容的结构性变更（如整幕字段重命名）。
- **次版本号**：向后兼容的功能增加（如增加新元素类型）。
- **修订号**：文档澄清或字段语义修正。

工具在加载旧版 Schema 文件时可以基于 `version` 做兼容处理。

---

## 与其他格式的映射

### 从 Fountain 转换

| Fountain | Novel2Story |
|----------|-------------|
| `INT./EXT. LOCATION - TIME` | `scene -> heading` |
| 角色名单独一行后接对白 | `elements[type=dialogue]` |
| `>` 前缀（动作） | `elements[type=action]` |
| `CUT TO:` | `elements[type=transition]` |

### 转换为 FDX

Novel2Story YAML → Python/Node.js 脚本 → FDX XML。
关键映射：

- `heading` → `ParagraphType="Scene Heading"`
- `dialogue` → `ParagraphType="Character"` + `ParagraphType="Dialogue"`
- `action` → `ParagraphType="Action"`
- `transition` → `ParagraphType="Transition"`

---

> 本文档对应 Novel2Story v1.0.0。如有疑问或建议，欢迎提交 Issue 讨论 Schema 设计的改进方向。
