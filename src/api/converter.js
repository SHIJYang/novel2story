/**
 * api/converter.js - AI 转换 API 层
 * 调用 OpenAI 兼容接口进行小说→剧本转换
 */
import axios from 'axios'

// 剧本 Schema 系统提示词
const SYSTEM_PROMPT = `你是一个专业的小说转剧本专家。请根据输入的小说章节内容，生成标准结构化剧本（YAML 格式）。

要求：
1. 将每个小说章节映射为一幕（Act）
2. 根据场景转换（地点/时间变化）切分场景（Scene）
3. 识别对话（Dialogue）和动作描写（Action）
4. 提取主要角色
5. 附上每个场景的标准 Slug Line（INT./EXT. 地点 - 时间）

输出格式必须严格遵循以下 YAML 结构：
\`\`\`yaml
screenplay:
  title: "剧本标题"
  author: "作者"
  source: "来源"
  sourceChapters: 3
  createdAt: "2026-01-01"
  version: "1.0.0"
  characters:
    - id: "char_001"
      name: "角色名"
      alias: []
      description: "描述"
      role: protagonist
      arc: ""
  acts:
    - id: "act_001"
      title: "章节标题"
      summary: "本幕概要"
      scenes:
        - id: "scn_001_001"
          heading: "INT. 客厅 - 白天"
          location: "客厅"
          time: "白天"
          summary: ""
          characters: ["char_001"]
          elements:
            - type: action
              content: "描述性内容"
            - type: dialogue
              character: "char_001"
              parenthetical: "语气"
              content: "对白内容"
            - type: transition
              content: "CUT TO:"
\`\`\`

只输出 YAML 内容，不要额外解释。如果输入章节不足 3 个，请先完成已有内容的转换。`

/**
 * 调用 OpenAI 进行 AI 转换
 * @param {string} novelText - 小说原文
 * @param {object} options - { apiKey, model, metadata }
 * @returns {Promise<{success:boolean, yaml?:string, error?:string}>}
 */
export async function convertWithAI(novelText, options = {}) {
  const { apiKey, model = 'gpt-3.5-turbo', metadata = {} } = options

  if (!apiKey) {
    return { success: false, error: '请填写 API Key' }
  }

  // 构建用户消息：包含小说文本和元信息
  const userContent = [
    `## 小说标题: ${metadata.title || '未命名'}`,
    metadata.author ? `## 作者: ${metadata.author}` : '',
    metadata.source ? `## 来源: ${metadata.source}` : '',
    '',
    '## 小说正文',
    '',
    novelText,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 8192,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      }
    )

    const content = response.data?.choices?.[0]?.message?.content || ''

    // 尝试提取 YAML 块（可能被 ```yaml ... ``` 包裹）
    let yaml = content.trim()
    const codeBlockMatch = yaml.match(/```(?:yaml)?\s*\n?([\s\S]*?)```/)
    if (codeBlockMatch) {
      yaml = codeBlockMatch[1].trim()
    }

    // 验证是否以 screenplay: 开头
    if (!yaml.startsWith('screenplay:')) {
      return { success: false, error: 'AI 返回格式异常，未找到剧本结构' }
    }

    return { success: true, yaml }
  } catch (err) {
    const message =
      err.response?.data?.error?.message ||
      err.message ||
      'API 调用失败，请检查网络连接和 API Key 有效性'
    return { success: false, error: message }
  }
}
