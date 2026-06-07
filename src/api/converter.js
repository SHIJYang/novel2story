/**
 * api/converter.js - AI 转换 API 层
 * 逐章转换：每章独立请求，携带前文摘要 + 已有人物表，保证输出详尽
 */
import axios from 'axios'

/* ===== 单章 System Prompt（强约束详尽输出） ===== */
const CHAPTER_SYSTEM_PROMPT = `你是一个小说转剧本专家。你的任务是把小说的每一个字、每一句话都转换成剧本格式，禁止任何级别的省略、概括或缩写。

## 铁律（违反任意一条，输出作废）

🚫 禁止对原文内容进行任何形式的概括
🚫 禁止将大段内容压缩成一行 action
🚫 禁止省略任何一句对话（包括自言自语、内心独白）
🚫 禁止省略角色的内心活动（必须用 action 或 parenthetical 呈现）
🚫 禁止省略环境描写、气氛渲染、细节动作
🚫 禁止使用"..."、"（省略）"、"[同上]"等省略标记

✅ 剧本内容应与小说原文详略相当
✅ 小说每一段 → 至少对应剧本中一个 element（通常 1~5 个）
✅ 每一句带引号的对话 → 独立 dialogue 节点
✅ 角色每一处动作、表情、心理活动 → 独立 action 节点
✅ 场景每变化一次（地点/时间/人物出入）→ 新的 scene
✅ 内心独白 → 用 action type，content 写"（内心独白：……）"

## 更不行

❌ 小说有三段、六段、十段描写 → "场景描述和人物动作，必须完整" 不等于 "写这一句话就完"
❌ 角色长篇大论 → 不能只保留开头和结尾两句
❌ 小说有详细的回忆剧情 → "记忆闪回" 四个字不够，要把回忆内容逐段写出
❌ 角色有复杂的心理描写 → 必须写进 action，不能省略
❌ 多个动作连续发生 → 都要写，不能合并为一句

## YAML 格式
- 2 空格缩进，严格对齐
- 只输出 YAML，不要 markdown 代码块标记，不要解释文字

## 输出结构
- 本章 = 一幕（act），可含多个场景（scene）
- 地点/时间变化 → 切分场景
- 角色表引用已有角色 ID，新角色按顺序递增

## 模板（仅供参考，实际输出长度 10~50 倍于此）
screenplay:
  title: "剧本标题"
  acts:
    - id: act_001
      title: "章节标题"
      scenes:
        - id: scn_001_001
          heading: "INT. 客厅 - 白天"
          location: "客厅"
          time: "白天"
          characters: [char_001]
          elements:
            - type: action
              content: "完整写出场景中的环境、动作、心理"

## 角色 ID 规则
- 已有角色直接引用 ID
- 新角色按 id char_NNN 递增（char_006, char_007……）
- 角色描述必须写完整（年龄/外貌/性格）`

/**
 * 构建单章用户消息
 * @param {object} chapter - {title, content}
 * @param {object} options
 * @param {object} options.metadata - {title, author}
 * @param {string} options.contextSummary - 前文摘要
 * @param {string} options.charactersYaml - 已有角色表 YAML 文本
 * @param {number} options.chapterIndex - 第几章 (1-based)
 */
function buildChapterUserContent(chapter, options = {}) {
  const { metadata = {}, contextSummary = '', charactersYaml = '', chapterIndex = 1 } = options
  const lines = [
    `# 剧本标题: ${metadata.title || '未命名'}`,
    metadata.author ? `# 作者: ${metadata.author}` : '',
    '',
  ]

  // 前文摘要
  if (contextSummary) {
    lines.push('## 前文提要（已转换章节的剧情摘要）')
    lines.push(contextSummary)
    lines.push('')
  }

  // 已有角色表
  if (charactersYaml) {
    lines.push('## 已有角色表（新角色按顺序添加，已有角色直接引用 ID）')
    lines.push(charactersYaml)
    lines.push('')
  }

  // 当前章节
  lines.push(`## 当前章节 - 第${chapterIndex}章: ${chapter.title || `第${chapterIndex}章`}`)
  lines.push('')
  lines.push(chapter.content || '（空）')
  lines.push('')

  // 尾部强调
  lines.push('---')
  lines.push('⚠️ 再强调一次：以上章节中每一句对话、每一处心理活动、每一段场景描写，都必须完整写入剧本。禁止任何省略。如果内容较长，可以拆分多个场景，但不能删除任何细节。')

  return lines.join('\n')
}

/**
 * 解析 AI 原始输出，提取合法 YAML
 */
function extractYaml(content) {
  const trimmed = content.trim()
  if (!trimmed) return { yaml: '', rawFallback: true }

  // 尝试提取 markdown 代码块
  const codeBlockMatch = trimmed.match(/```(?:yaml)?\s*\n?([\s\S]*?)```/)
  const raw = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed

  if (!raw.startsWith('screenplay:')) {
    return { yaml: `# ⚠️ 模型未按格式返回 YAML，以下为原始输出，可手动编辑或使用其他模型\n${raw}`, rawFallback: true }
  }

  return { yaml: raw, rawFallback: false }
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

    const { yaml, rawFallback } = extractYaml(content)
    if (!yaml) {
      return { success: false, error: '无法从 API 返回中提取有效内容' }
    }

    return { success: true, yaml, rawFallback }
  } catch (err) {
    return { success: false, error: formatApiError(err, endpoint) }
  }
}
