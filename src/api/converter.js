/**
 * api/converter.js - AI 转换 API 层
 * 支持任意 OpenAI 兼容接口（OpenAI、Ollama、DeepSeek、Claude 等）
 * 支持增量转换（前文摘要 + 新章节）
 */
import axios from 'axios'

/* ===== System Prompt（~500 token） ===== */
const SYSTEM_PROMPT = `你是一个专业的小说转剧本专家。根据输入的小说章节，生成 YAML 格式结构化剧本。

## 重要：YAML 格式要求
- **必须使用 2 空格缩进**，严禁使用单个空格
- 每个层级严格递增 2 个空格
- 输出前自检缩进是否正确
- **只输出 YAML，不要任何解释文字或 markdown 代码块标记**

## 输出结构
- 每个小说章节 = 一幕（act）
- 场景转换（地点/时间变化）切分场景
- 对话（dialogue）+ 动作描写（action）+ 转场（transition）
- 全局角色表，场景引用角色 ID

## YAML 模板
screenplay:
  title: "剧本标题"
  characters:
    - id: char_001
      name: "角色名"
      role: protagonist
  acts:
    - id: act_001
      title: "章节标题"
      scenes:
        - id: scn_001_001
          heading: "INT. 客厅 - 白天"
          characters: [char_001]
          elements:
            - type: action
              content: "描述"
            - type: dialogue
              character: char_001
              parenthetical: "语气"
              content: "对白"

## 规则
1. 角色 ID 格式: char_001, char_002 ... 全局递增
2. Slug Line: INT./EXT. + 地点 + 时间
3. 对话用 parenthetical 标注语气
4. 转场用 CUT TO:/FADE IN:/FADE OUT.
5. **只输出 YAML，不要多余解释**`

/**
 * 构建用户消息（含/不含上下文摘要）
 * @param {Array<{title:string, content:string}>} chapterTexts
 * @param {object} options  - {metadata, contextSummary}
 */
function buildUserContent(chapterTexts, options = {}) {
  const { metadata = {}, contextSummary } = options
  const lines = [
    `# 标题: ${metadata.title || '未命名'}`,
    metadata.author ? `# 作者: ${metadata.author}` : '',
    '',
  ]

  if (contextSummary) {
    lines.push('## 已转换章节摘要')
    lines.push(contextSummary)
    lines.push('')
    lines.push('## 新增章节（请转换为新场景追加到已有剧本中）')
    lines.push('')
  } else {
    lines.push('## 小说正文')
    lines.push('')
  }

  chapterTexts.forEach((ch, i) => {
    lines.push(`### ${ch.title || `第${i + 1}章`}`)
    lines.push('')
    lines.push(ch.content || '（空）')
    lines.push('')
  })

  return lines.filter(Boolean).join('\n')
}

/**
 * 解析 AI 原始输出，提取合法 YAML
 * @param {string} content - AI 返回的原始文本
 * @returns {{ yaml: string, rawFallback: boolean }}
 */
function extractYaml(content) {
  const trimmed = content.trim()
  if (!trimmed) return { yaml: '', rawFallback: true }

  // 尝试提取 markdown 代码块
  const codeBlockMatch = trimmed.match(/```(?:yaml)?\s*\n?([\s\S]*?)```/)
  const raw = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed

  if (!raw.startsWith('screenplay:')) {
    // 保留原始输出（不做注释转义），让用户看到模型实际返回了什么
    return { yaml: `# ⚠️ 模型未按格式返回 YAML，以下为原始输出，可手动编辑或使用其他模型\n${raw}`, rawFallback: true }
  }

  // 尝试验证 YAML 合法性
  try {
    const jsYaml = globalThis.yaml || null
    // 如果有 js-yaml 可验证，后续可在调用处处理
    return { yaml: raw, rawFallback: false }
  } catch {
    return { yaml: raw, rawFallback: false }
  }
}

/**
 * 构建更丰富的错误信息
 */
function formatApiError(err, endpoint) {
  const status = err.response?.status
  const statusText = err.response?.statusText
  const body = err.response?.data

  // 提取各种可能的错误消息位置
  let errorMessage = ''
  if (body?.error?.message) errorMessage = body.error.message
  else if (body?.error?.code) errorMessage = `${body.error.code}: ${body.error.message || ''}`
  else if (body?.detail) errorMessage = body.detail
  else if (typeof body === 'string') errorMessage = body
  else if (body && typeof body === 'object') {
    try { errorMessage = JSON.stringify(body).slice(0, 500) } catch { errorMessage = '' }
  }

  if (err.code === 'ECONNREFUSED') {
    return `连接被拒绝: ${endpoint}（服务器未启动或地址错误）`
  }
  if (err.code === 'ECONNABORTED') {
    return `请求超时（120s）: ${endpoint} 响应过慢`
  }
  if (err.code === 'ERR_NETWORK') {
    return `网络错误: 无法连接到 ${endpoint}，请检查网络`
  }

  const parts = [status, statusText, errorMessage, err.message].filter(Boolean)
  return parts.join(' | ')
}

/**
 * 调用 AI 转换
 * @param {Array<{title:string, content:string}>} chapterTexts - 章节列表
 * @param {object} options
 * @param {string} options.apiKey - API Key
 * @param {string} options.model - 模型名称
 * @param {object} [options.metadata] - {title, author}
 * @param {string} [options.endpoint] - API 端点
 * @param {string} [options.contextSummary] - 已转换章节的摘要（增量模式）
 * @param {number} [options.temperature=0.3]
 * @param {number} [options.maxTokens=8192]
 * @param {number} [options.timeout=120000]
 * @returns {Promise<{success:boolean, yaml?:string, error?:string}>}
 */
export async function convertWithAI(chapterTexts, options = {}) {
  const {
    apiKey = '',
    model = 'agnes-2.0-flash',
    metadata = {},
    endpoint = 'https://apihub.agnes-ai.com/v1/chat/completions',
    contextSummary = '',
    temperature = 0.3,
    maxTokens = 8192,
    timeout = 120000,
  } = options

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserContent(chapterTexts, { metadata, contextSummary }) },
    ],
    temperature,
    max_tokens: maxTokens,
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }

  try {
    const response = await axios.post(endpoint, requestBody, { headers, timeout })
    const content = response.data?.choices?.[0]?.message?.content || ''
    if (!content.trim()) {
      return { success: false, error: 'API 返回内容为空' }
    }

    const { yaml, rawFallback } = extractYaml(content)
    if (!yaml) {
      return { success: false, error: '无法从 API 返回中提取有效内容' }
    }

    return { success: true, yaml, rawFallback }
  } catch (err) {
    return { success: false, error: formatApiError(err, endpoint) }
  }
}

/**
 * 生成已转换内容的摘要（用于增量转换）
 * @param {object} screenplay - 当前 screenplay 对象
 * @param {number} maxChars - 摘要最大字符数
 * @returns {string}
 */
export function buildContextSummary(screenplay, maxChars = 2000) {
  if (!screenplay?.screenplay) return ''

  const sp = screenplay.screenplay
  const parts = []

  const chars = sp.characters || []
  parts.push(`角色: ${chars.map(c => `${c.id}=${c.name}`).join(', ')}`)

  const acts = sp.acts || []
  acts.forEach((act, i) => {
    const scenes = (act.scenes || []).map((s, j) => {
      const chars = (s.characters || []).join(', ')
      const loc = s.location || s.heading?.split('-')?.[0]?.trim() || '未知'
      return `  scn_${i + 1}_${j + 1}: ${loc} | 角色: ${chars || '—'}`
    })
    parts.push(`\n${act.title || `幕${i + 1}`}: ${act.summary || ''}`)
    parts.push(scenes.slice(0, 8).join('\n'))
    if (scenes.length > 8) parts.push(`  ... 还有 ${scenes.length - 8} 个场景`)
  })

  let summary = parts.join('\n')
  if (summary.length > maxChars) {
    summary = summary.slice(0, maxChars) + '\n...（摘要截断）'
  }
  return summary
}
