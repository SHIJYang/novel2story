/**
 * stores/novel.js - 小说状态管理
 */
import { defineStore } from 'pinia'
import { parseNovel } from '@/utils/novelParser.js'
import { convertNovelToScreenplay, buildYamlOutput } from '@/utils/converter.js'

const STORAGE_KEY = 'novel2story_api_config'

function loadApiConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { apiKey: '', model: 'gpt-3.5-turbo', rememberKey: false }
}

function saveApiConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch { /* ignore */ }
}

export const useNovelStore = defineStore('novel', {
  state: () => ({
    // 输入
    novelText: '',
    metadata: { title: '', author: '', source: '' },

    // 解析
    chapters: [],
    chapterCount: 0,
    autoSplitPending: false,

    // 剧本
    screenplay: null,
    yamlOutput: '',

    // 转换状态
    isConverting: false,
    error: null,

    // API 配置
    apiKey: loadApiConfig().apiKey,
    model: loadApiConfig().model || 'gpt-3.5-turbo',
    rememberKey: loadApiConfig().rememberKey ?? false,
  }),

  getters: {
    charCount: (s) => s.novelText.length,
    hasResult: (s) => !!s.yamlOutput,
    characters: (s) => s.screenplay?.screenplay?.characters ?? [],
    chapterDetectedCount: (s) => s.chapterCount,
    chaptersEnough: (s) => s.chapterCount >= 3,
  },

  actions: {
    setNovelText(text) {
      this.novelText = text
      // 即时检测章节数
      const parsed = parseNovel(text)
      this.chapterCount = parsed.length
      this.chapters = parsed
      this.error = null
    },

    /** 自动分割为 3 章（按段落均分） */
    autoSplitIntoThree() {
      const paragraphs = this.novelText
        .split(/\n\s*\n/)
        .map(s => s.trim())
        .filter(Boolean)

      if (paragraphs.length < 3) {
        this.error = '文本段落数不足 3 段，无法自动分割。请手动添加章节标题。'
        return
      }

      const perGroup = Math.ceil(paragraphs.length / 3)
      const groups = []
      for (let i = 0; i < 3; i++) {
        groups.push(paragraphs.slice(i * perGroup, (i + 1) * perGroup))
      }

      const chapterNames = ['第一幕', '第二幕', '第三幕']
      const text = groups
        .map((g, i) => `# ${chapterNames[i]}\n\n${g.join('\n\n')}`)
        .join('\n\n')

      this.novelText = text

      // 重新检测
      const parsed = parseNovel(text)
      this.chapterCount = parsed.length
      this.chapters = parsed
      this.error = null
    },

    setApiKey(key) {
      this.apiKey = key
      if (this.rememberKey) saveApiConfig({ apiKey: key, model: this.model, rememberKey: true })
    },

    setModel(model) {
      this.model = model
      if (this.rememberKey) saveApiConfig({ apiKey: this.apiKey, model, rememberKey: true })
    },

    setRememberKey(val) {
      this.rememberKey = val
      if (val) {
        saveApiConfig({ apiKey: this.apiKey, model: this.model, rememberKey: true })
      } else {
        saveApiConfig({ apiKey: '', model: this.model, rememberKey: false })
        localStorage.removeItem(STORAGE_KEY)
      }
    },

    /** 直接填充 AI 返回的 YAML */
    setYamlOutput(yaml) {
      this.yamlOutput = yaml
    },

    /** 启动转换（规则引擎版，保留作为降级） */
    async runConversion() {
      this.error = null
      if (!this.novelText.trim()) {
        this.error = '请先输入小说文本'
        return false
      }

      this.isConverting = true
      try {
        const chapters = parseNovel(this.novelText)
        if (chapters.length === 0) {
          this.error = '未能识别到有效章节内容，请检查输入'
          return false
        }
        this.chapters = chapters
        this.chapterCount = chapters.length

        const meta = {
          title: this.metadata.title || '',
          author: this.metadata.author || '',
          source: this.metadata.source || '',
        }
        this.screenplay = convertNovelToScreenplay(chapters, meta)
        this.yamlOutput = buildYamlOutput(this.screenplay)
        return true
      } catch (err) {
        this.error = `转换失败: ${err.message}`
        return false
      } finally {
        this.isConverting = false
      }
    },

    reset() {
      this.novelText = ''
      this.metadata = { title: '', author: '', source: '' }
      this.chapters = []
      this.chapterCount = 0
      this.screenplay = null
      this.yamlOutput = ''
      this.isConverting = false
      this.error = null
    },
  },
})
