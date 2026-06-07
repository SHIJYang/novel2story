/**
 * api/converter.js - AI 转换 API 层
 * 逐章转换：每章独立请求，携带前文摘要 + 已有人物表，保证输出详尽
 */
import axios from 'axios'
import yaml from 'js-yaml'
/* ===== 单章 System Prompt（精简版） ===== */
const CHAPTER_SYSTEM_PROMPT = `你是小说转剧本专家。将小说的每一句话都转换为剧本格式，禁止任何省略或概括。

## 核心规则
- 小说每一句对话 → 独立 dialogue 节点
- 小说每一处动作、心理、环境 → 独立 action 节点
- 内心独白 → action type，以"（内心独白：……）"呈现
- 禁止使用"..."、"[同上]"等省略标记
- 小说每段至少对应剧本中一个 element
- 地点/时间/人物出入变化 → 切分场景

## 输出格式

请按以下顺序输出两段内容，中间空一行隔开：

### 第一段：本章剧情摘要
chapterSummary: "50-100字概括本章核心剧情"

### 第二段：完整剧本（含角色列表）
screenplay:
  title: "剧本标题"
  author: ""
  source: ""
  sourceChapters: 1
  createdAt: "2026-06-07"
  version: "1.0"

  characters:
    - id: "char_001"
      name: "张三"
      alias: []
      description: "25岁，青年，性格沉稳"
      role: protagonist
      arc: ""
    - id: "char_002"
      name: "李四"
      alias: []
      description: "30岁，反派，心狠手辣"
      role: antagonist
      arc: ""

  acts:
    - id: "act_001"
      title: "第1章标题"
      summary: ""
      scenes:
        - id: "scn_001_001"
          heading: "INT. 客厅 - 白天"
          location: "客厅"
          time: "白天"
          summary: ""
          characters: ["char_001"]
          elements:
            - type: action
              content: "环境、动作、心理描写"
            - type: dialogue
              character: "char_001"
              parenthetical: "轻声说"
              content: "对话内容"

## 格式约束
- 双层缩进，字段值全部用双引号包裹
- 只输出纯 YAML，不要 markdown 代码块标记，不要解释文字
- 已有角色保留原 ID，新角色按 char_NNN 递增
- id 和 character 引用值必须用双引号`

/**
 * 构建单章用户消息（精简版）
 */
function buildChapterUserContent(chapter, options = {}) {
  const { metadata = {}, contextSummary = '', charactersYaml = '', chapterIndex = 1 } = options
  const lines = []

  if (contextSummary) {
    lines.push('## 前文提要')
    lines.push(contextSummary)
    lines.push('')
  }

  if (charactersYaml) {
    lines.push('## 已有角色表')
    lines.push(charactersYaml)
    lines.push('')
  }

  lines.push(`## 当前章节 - 第${chapterIndex}章: ${chapter.title || ''}`)
  lines.push('')
  lines.push(chapter.content || '（空）')

  return lines.join('\n')
}
/**
 * 尝试从原始文本中提取纯 YAML（去掉 markdown 代码块包裹）
 */
function extractRawYaml(content) {
  const trimmed = content.trim()
  if (!trimmed) return ''
  const codeBlockMatch = trimmed.match(/```(?:yaml)?\s*\n?([\s\S]*?)```/)
  return codeBlockMatch ? codeBlockMatch[1].trim() : trimmed
}

/**
 * 从 API 返回的原始内容中解析两段 YAML：chapterSummary + screenplay（含 characters）
 * @param {string} content - API 返回的原始文本
 * @returns {{ summary: string, characters: object[], screenplay: object|null, rawYaml: string, rawFallback: boolean }}
 */
export function parseStructuredYaml(content) {
  const raw = extractRawYaml(content)
  const result = { summary: '', characters: [], screenplay: null, rawYaml: raw, rawFallback: false }

  if (!raw) {
    result.rawFallback = true
    return result
  }

  try {
    const parsed = yaml.load(raw)
    if (parsed && typeof parsed === 'object') {
      if (parsed.chapterSummary) result.summary = String(parsed.chapterSummary).trim()

      // characters 在 screenplay 内部
      if (parsed.screenplay) {
        result.screenplay = parsed.screenplay
        if (Array.isArray(parsed.screenplay.characters)) {
          result.characters = parsed.screenplay.characters
        }
      }

      return result
    }
  } catch { /* fall through */ }

  // 解析失败 fallback
  const scMatch = raw.match(/screenplay:[\s\S]*/)
  if (scMatch) {
    result.rawYaml = scMatch[0]
  }
  result.rawFallback = true
  return result
}

/**
 * 构建更丰富的错误信息
 */
function formatApiError(err, endpoint) {
  const status = err.response?.status
  const statusText = err.response?.statusText
  const body = err.response?.data

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
    return `请求超时: ${endpoint} 响应过慢`
  }
  if (err.code === 'ERR_NETWORK') {
    return `网络错误: 无法连接到 ${endpoint}，请检查网络`
  }

  const parts = [status, statusText, errorMessage, err.message].filter(Boolean)
  return parts.join(' | ')
}

/**
 * 调用 AI 转换**单个章节**
 * @param {object} chapter - {title:string, content:string}
 * @param {object} options
 * @param {string} options.apiKey
 * @param {string} options.model
 * @param {object} [options.metadata]
 * @param {string} [options.contextSummary] - 前文剧情摘要
 * @param {string} [options.charactersYaml] - 已有角色表的 YAML 字符串
 * @param {number} [options.chapterIndex] - 1-based 章节序号
 * @param {string} [options.endpoint]
 * @param {number} [options.temperature=0.3]
 * @param {number} [options.maxTokens=16384]
 * @param {number} [options.timeout=120000]
 * @returns {Promise<{success:boolean, yaml?:string, error?:string}>}
 */
export async function convertChapterWithAI(chapter, options = {}) {
  const {
    apiKey = '',
    model = 'agnes-2.0-flash',
    metadata = {},
    contextSummary = '',
    charactersYaml = '',
    chapterIndex = 1,
    endpoint = 'https://apihub.agnes-ai.com/v1/chat/completions',
    temperature = 0.3,
    maxTokens = 32768,
    timeout = 180000,
  } = options

  // 判断是否为 DeepSeek（通过 model 名称或 endpoint 判断）
  const isDeepSeek = model.startsWith('deepseek') || endpoint.includes('api.deepseek.com')

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: CHAPTER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildChapterUserContent(chapter, { metadata, contextSummary, charactersYaml, chapterIndex }),
      },
    ],
    temperature,
    max_tokens: maxTokens,
    ...(isDeepSeek
      ? { thinking: { type: 'enabled' }, reasoning_effort: 'high' }
      : {}),
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

    const parsed = parseStructuredYaml(content)
    if (!parsed.screenplay && !parsed.rawYaml) {
      return { success: false, error: '无法从 API 返回中提取有效内容' }
    }

    // 重建完整 YAML 用于显示
    const fullYaml = parsed.rawYaml

    return {
      success: true,
      yaml: fullYaml,
      summary: parsed.summary,
      characters: parsed.characters,
      screenplay: parsed.screenplay,
      rawFallback: parsed.rawFallback,
    }
  } catch (err) {
    return { success: false, error: formatApiError(err, endpoint) }
  }
}
