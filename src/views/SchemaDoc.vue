<template>
  <div class="schema-view">
    <el-backtop target=".schema-view .schema-content" :right="30" :bottom="80" />

    <div class="schema-content">
      <!-- 页头 -->
      <div class="doc-header">
        <h1>📖 剧本 YAML Schema 文档</h1>
        <p class="doc-meta">Novel2Story 结构化剧本数据格式定义 v1.0.0</p>
        <p class="doc-sub">
          用于从小说章节(≥3章)自动转换为结构化剧本初稿,支持人工编辑与二次打磨。
        </p>
      </div>

      <!-- 设计理念 -->
      <div class="section-title">
        <span>🎯 设计理念</span>
      </div>
      <el-row :gutter="16" class="section">
        <el-col :span="6" v-for="p in principles" :key="p.icon">
          <el-card shadow="never" class="principle-card" :body-style="{ padding: '20px' }">
            <div class="principle-icon">{{ p.icon }}</div>
            <h3 class="principle-title">{{ p.title }}</h3>
            <p class="principle-desc">{{ p.desc }}</p>
          </el-card>
        </el-col>
      </el-row>

      <!-- Schema 总览 -->
      <div class="section-title">
        <span>📐 Schema 总览</span>
      </div>
      <el-card shadow="never" class="section">
        <pre class="code-block"><code>screenplay:
            title string # 剧本标题
            author string # 作者
            source string # 来源小说
            sourceChapters integer # 转换所用章节数
            createdAt string(date) # 生成日期
            version string # Schema 版本
            characters []Character # 角色表
            acts []Act # 幕列表(基于章节拆分)</code></pre>
      </el-card>

      <!-- 元数据 -->
      <div class="section-title">
        <span>📋 元数据(Metadata)</span>
      </div>
      <el-card shadow="never" class="section">
        <el-table :data="metaFields" border stripe size="small">
          <el-table-column prop="field" label="字段" width="160">
            <template #default="{ row }"><code>{{ row.field }}</code></template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="required" label="必需" width="60" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.required" size="small" type="danger">✅</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="desc" label="说明" />
        </el-table>
      </el-card>

      <!-- 角色 -->
      <div class="section-title">
        <span>👥 角色(Character)</span>
      </div>
      <el-card shadow="never" class="section">
        <el-table :data="charFields" border stripe size="small">
          <el-table-column prop="field" label="字段" width="160">
            <template #default="{ row }"><code>{{ row.field }}</code></template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="required" label="必需" width="60" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.required" size="small" type="danger">✅</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="desc" label="说明" />
        </el-table>
      </el-card>

      <!-- 幕 -->
      <div class="section-title">
        <span>🎭 幕(Act)</span>
      </div>
      <el-card shadow="never" class="section">
        <el-table :data="actFields" border stripe size="small">
          <el-table-column prop="field" label="字段" width="160">
            <template #default="{ row }"><code>{{ row.field }}</code></template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="required" label="必需" width="60" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.required" size="small" type="danger">✅</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="desc" label="说明" />
        </el-table>
      </el-card>

      <!-- 场景 -->
      <div class="section-title">
        <span>🎬 场景(Scene)</span>
      </div>
      <el-card shadow="never" class="section">
        <el-table :data="sceneFields" border stripe size="small">
          <el-table-column prop="field" label="字段" width="160">
            <template #default="{ row }"><code>{{ row.field }}</code></template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="required" label="必需" width="60" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.required" size="small" type="danger">✅</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="desc" label="说明" />
        </el-table>
      </el-card>

      <!-- 场景元素 -->
      <div class="section-title">
        <span>🎬 场景元素(Element)</span>
      </div>
      <el-card shadow="never" class="section">
        <p class="field-note">
          三种核心类型:
          <el-tag size="small">action</el-tag> 动作描写
          <el-tag size="small">dialogue</el-tag> 对白
          <el-tag size="small">transition</el-tag> 转场
        </p>
        <el-table :data="elementFields" border stripe size="small">
          <el-table-column prop="field" label="字段" width="160">
            <template #default="{ row }"><code>{{ row.field }}</code></template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="required" label="必需" width="60" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.required === true" size="small" type="danger">✅</el-tag>
              <el-tag v-else-if="row.required === 'dialogue'" size="small" type="warning">dialogue</el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="desc" label="说明" />
        </el-table>
      </el-card>

      <!-- 完整示例 -->
      <div class="section-title">
        <span>📄 完整示例(基于 ≥3 章小说自动转换)</span>
      </div>
      <el-card shadow="never" class="section">
        <el-collapse>
          <el-collapse-item title="点击展开/折叠完整 YAML 示例" name="1">
            <pre class="code-block"><code>{{ fullExample }}</code></pre>
          </el-collapse-item>
        </el-collapse>
      </el-card>

      <!-- 设计决策 FAQ -->
      <div class="section-title">
        <span>❓ 设计决策 FAQ</span>
      </div>
      <el-card shadow="never" class="section">
        <el-collapse>
          <el-collapse-item v-for="(qa, i) in faqs" :key="i" :title="qa.q" :name="String(i)">
            <p class="qa-answer">{{ qa.a }}</p>
          </el-collapse-item>
        </el-collapse>
      </el-card>

      <!-- 与 AI 转换工具的关联说明 -->
      <div class="section-title">
        <span>⚙️ 与 AI 剧本转换工具的关系</span>
      </div>
      <el-card shadow="never" class="section">
        <ul class="tool-note">
          <li>✅ 工具会将 <strong>≥3 个章节</strong> 的小说文本,按本 Schema 自动拆分为 <strong>幕 → 场景 → 元素</strong>。</li>
          <li>✅ 自动识别 <strong>角色、地点、时间</strong>,并建立角色引用(<code>id</code>)。</li>
          <li>✅ 将小说中的心理描写、背景说明转化为 <strong>action / dialogue</strong>,符合"展示,不要告诉"原则。</li>
          <li>✏️ 作者可在生成的 YAML 上直接修改或使用可视化编辑器进一步打磨。</li>
          <li>🔁 支持后续 <strong>重新导入、合并修改</strong>,实现"AI 初稿 + 人工精修"的工作流。</li>
        </ul>
      </el-card>
    </div>
  </div>
</template>

<script setup>
const principles = [
  { icon: '🎯', title: '语义保真', desc: '保留原著叙事结构(章节→幕),同时映射到标准剧本元素(场景、对白、动作)。' },
  { icon: '✏️', title: '可编辑', desc: 'YAML 比 JSON/XML 更适合编剧手工编辑,不需要专业软件也能修改。' },
]

const metaFields = [
  { field: 'title', type: 'string', required: true, desc: '剧本标题' },
  { field: 'author', type: 'string', required: false, desc: '作者' },
  { field: 'source', type: 'string', required: false, desc: '来源小说' },
  { field: 'sourceChapters', type: 'integer', required: true, desc: '章节数(≥3),用于估算转换工作量' },
  { field: 'createdAt', type: 'date', required: true, desc: '生成日期 YYYY-MM-DD' },
  { field: 'version', type: 'string', required: true, desc: 'Schema 版本号(SemVer),用于向后兼容' },
]

const charFields = [
  { field: 'id', type: 'string', required: true, desc: '唯一标识 char_001,被场景/对话引用' },
  { field: 'name', type: 'string', required: true, desc: '角色显示名' },
  { field: 'alias', type: 'string[]', required: false, desc: '别名/昵称,用于匹配小说中不同称呼' },
  { field: 'description', type: 'string', required: false, desc: '角色描述:年龄、外貌、性格' },
  { field: 'role', type: 'enum', required: false, desc: 'protagonist / antagonist / supporting / minor' },
  { field: 'arc', type: 'string', required: false, desc: '角色弧光/成长线' },
]

const actFields = [
  { field: 'id', type: 'string', required: true, desc: '唯一标识 act_001' },
  { field: 'title', type: 'string', required: true, desc: '幕标题,默认映射为小说章节名' },
  { field: 'summary', type: 'string', required: false, desc: '剧情摘要,AI 自动生成' },
  { field: 'scenes', type: 'Scene[]', required: true, desc: '场景列表,至少 1 个场景' },
]

const sceneFields = [
  { field: 'id', type: 'string', required: true, desc: 'scn_001_001(幕索引_场景索引)' },
  { field: 'heading', type: 'string', required: true, desc: 'INT./EXT. 地点 - 时间' },
  { field: 'location', type: 'string', required: false, desc: '从文本提取的地点' },
  { field: 'time', type: 'string', required: false, desc: '从文本提取的时间段' },
  { field: 'summary', type: 'string', required: false, desc: '场景概要' },
  { field: 'characters', type: 'string[]', required: false, desc: '场景中的角色 ID 列表' },
  { field: 'elements', type: 'Element[]', required: true, desc: '动作/对白/转场元素' },
]

const elementFields = [
  { field: 'type', type: 'enum', required: true, desc: 'action / dialogue / transition' },
  { field: 'content', type: 'string', required: true, desc: '元素内容文本' },
  { field: 'character', type: 'string', required: 'dialogue', desc: '说话角色 ID,引用 characters[].id' },
  { field: 'parenthetical', type: 'string', required: false, desc: '语气/动作指示,如"低声""叹气"' },
]

const faqs = [
  { q: '为什么用 id 引用角色而不是直接用名字？', a: '一个角色可能有多个称呼（本名、外号、场合称呼）。用 id 引用可以在不修改所有对白引用的前提下修改角色名。AI 生成时，名字同音不同字的情形也更易处理。' },
  { q: '为什么场景元素用数组而不是嵌套结构？', a: '剧本本质上是顺序文本——动作和对白交替出现，构成线性叙事流。数组忠实于这个本质，也更容易在编辑器中进行拖拽排序。' },
  { q: '为什么不直接用 Fountain 或 FDX 格式？', a: 'Fountain 是纯文本标注，无法直接提取结构化信息。FDX (XML) 人类不可读。YAML 介于两者之间：保留机器可分析性，同时人类可以用文本编辑器直接改。' },
  { q: '小说心理描写会丢失吗？', a: '不是丢失，是转译。剧本只记录看得见听得见的东西。心理描写、背景叙事等通过动作和对白来表现。例如"他感到很紧张" → action："他握紧拳头，来回踱步"。' },
  { q: '如何处理内心独白？', a: '可外化的心理活动 → 转化为 action。内心独白 → 标为 (V.O.) 画外音对话，在 parenthetical 中标注。后续版本可能增加 monologue 类型。' },
  { q: '支持全局剧本和章节剧本两种输出？', a: '一次调用即生成全局剧本（完整角色表 + 所有幕）和每章独立的章节剧本（仅该章角色 + 场景）。全局剧本用于整体把握，章节剧本用于分章精修。右上角「全局/章节」视图切换查阅。' },
]

const fullExample = `screenplay:
  title: "意外的访客"
  author: "佚名"
  source: "原创都市小说"
  sourceChapters: 3
  createdAt: "2026-06-05"
  version: "1.0.0"

  characters:
    - id: "char_001"
      name: "李明"
      alias: []
      description: "28岁,程序员"
      role: protagonist
      arc: "从被动接受到主动抗争"
    - id: "char_002"
      name: "林晓"
      alias: []
      description: "约30岁,警官"
      role: antagonist
      arc: ""

  acts:
    - id: "act_001"
      title: "第一章 意外的访客"
      summary: "李明接到警察电话,得知父亲二十年前的失踪线索。"
      scenes:
        - id: "scn_001_001"
          heading: "INT. 客厅 - 清晨"
          location: "客厅"
          time: "清晨"
          summary: ""
          characters: ["char_001", "char_002"]
          elements:
            - type: action
              content: "阳光透过窗帘洒进客厅。李明坐在电脑前,已经连续工作了十二个小时。"
            - type: dialogue
              character: "char_001"
              parenthetical: "叹气"
              content: "这个bug我改了一整天......"
            - type: action
              content: "手机突然震动。他看了一眼来电显示:陌生号码。"
            - type: dialogue
              character: "char_002"
              parenthetical: "冷静"
              content: "李警官?"
            - type: dialogue
              character: "char_001"
              parenthetical: "疑惑"
              content: "您找谁?"
`
</script>

<style scoped>
.schema-view {
  height: 100%;
  overflow: hidden;
  background: var(--color-bg-page, #f5f7fa);
}

.schema-content {
  height: 100%;
  overflow-y: auto;
  max-width: 1000px;
  margin: 0 auto;
  padding: 24px 32px 60px 32px;
}

.doc-header {
  margin-bottom: 28px;
  padding-bottom: 16px;
  border-bottom: 2px solid #409eff;
}

.doc-header h1 {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 8px;
  letter-spacing: -0.3px;
}

.doc-meta {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 8px;
}

.doc-sub {
  font-size: 14px;
  color: #4b5563;
  line-height: 1.5;
}

.section-title {
  margin: 28px 0 12px 0;
  font-weight: 600;
  font-size: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-left: 3px solid #409eff;
  padding-left: 12px;
}

.section {
  margin-bottom: 24px;
}

.principle-card {
  height: 100%;
  border: 1px solid #e5e7eb;
  transition: all 0.2s ease;
  background-color: #ffffff;
}

.principle-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.principle-icon {
  font-size: 28px;
  margin-bottom: 10px;
}

.principle-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 8px;
}

.principle-desc {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.6;
}

.code-block {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px 20px;
  overflow-x: auto;
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Cascadia Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}

.code-block code {
  font-family: inherit;
  color: #0f172a;
}

.field-note {
  font-size: 13px;
  color: #4b5563;
  margin-bottom: 14px;
}

:deep(td code) {
  font-family: monospace;
  font-size: 12px;
  background: #f1f3f5;
  padding: 2px 6px;
  border-radius: 4px;
  color: #b45309;
}

.qa-answer {
  font-size: 14px;
  line-height: 1.7;
  color: #374151;
}

.tool-note {
  margin: 0;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.8;
  color: #1f2937;
}

.tool-note li {
  margin-bottom: 8px;
}

.tool-note code {
  background: #eef2ff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #1e40af;
}
</style>