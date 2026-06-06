/**
 * stores/novel.js - 小说状态管理（持久化 + 章节管理）
 */
import { defineStore } from 'pinia'
import { parseNovel, splitIntoChapterTexts } from '@/utils/novelParser.js'
import { convertNovelToScreenplay, buildYamlOutput } from '@/utils/converter.js'
import { convertWithAI, buildContextSummary } from '@/api/converter.js'
import yaml from 'js-yaml'

const STATE_KEY = 'novel2story_state'
const API_KEY_STORAGE = 'sk-6zRjJlpnuNlHGLiCkNJqEfUBzMtuzqXqYqDrF0qG8eJOEXkO'
const CONFIG_KEY = 'novel2story_apiconfig'

/* ===== 统一持久化 ===== */
const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return JSON.parse(raw)
    } catch { /* ignore */ }
    return fallback
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* ignore */ }
  },
  remove(key) {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
  },
  getRaw(key, fallback = '') {
    try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
  },
  setRaw(key, val) {
    try { localStorage.setItem(key, val) } catch { /* ignore */ }
  },
}

export const useNovelStore = defineStore('novel', {
  state: () => {
    const saved = storage.get(STATE_KEY)
    const savedCfg = storage.get(CONFIG_KEY)
    return {
      novelText: saved?.novelText || '',
      metadata: saved?.metadata || { title: '', author: '', source: '' },

      chapterTexts: saved?.chapterTexts || [],
      chapterCount: saved?.chapterTexts?.length || 0,

      chapters: [],
      screenplay: saved?.screenplay || null,
      yamlOutput: saved?.yamlOutput || '',
      contextSummary: saved?.contextSummary || '',

      isConverting: false,
      error: null,

      apiKey: storage.getRaw(API_KEY_STORAGE) || 'sk-6zRjJlpnuNlHGLiCkNJqEfUBzMtuzqXqYqDrF0qG8eJOEXkO',
      provider: 'agnes',
      endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions',
      model: 'agnes-2.0-flash',
      rememberKey: !!storage.getRaw(API_KEY_STORAGE),

      incrementalMode: savedCfg?.incrementalMode ?? true,

      inputMode: 'input',
      convertProgress: 0,
      currentConvertingChapter: '',
    }
  },

  getters: {
    hasResult: (s) => !!s.yamlOutput,
    characters: (s) => s.screenplay?.screenplay?.characters ?? [],
    chaptersEnough: (s) => s.chapterCount >= 3,

    convertedActCount: (s) => s.screenplay?.screenplay?.acts?.length || 0,
    pendingChapters: (s) => {
      const converted = s.screenplay?.screenplay?.acts?.length || 0
      return s.chapterTexts.slice(converted)
    },
    canContinueConvert: (s) => {
      if (!s.incrementalMode) return false
      const converted = s.screenplay?.screenplay?.acts?.length || 0
      return converted > 0 && converted < s.chapterTexts.length
    },
  },

  actions: {
    /* ===== 文本 → 章节解析 ===== */
    setNovelText(text) {
      this.novelText = text
      const result = splitIntoChapterTexts(text)
      this.chapterTexts = result.chapters
      this.chapterCount = result.chapters.length
      if (result.novelTitle && !this.metadata.title) {
        this.metadata.title = result.novelTitle
      }
      this.chapters = parseNovel(text)
      this.error = null
      this._save()
    },

    enterChapterMode() {
      if (this.chapterTexts.length > 0) this.inputMode = 'chapters'
    },
    enterInputMode() {
      this.inputMode = 'input'
    },

    /* ===== 章节 CRUD ===== */
    updateChapterContent(index, content) {
      if (index < 0 || index >= this.chapterTexts.length) return
      this.chapterTexts[index].content = content
      this._rebuildFromChapters()
      this._save()
    },

    updateChapterTitle(index, title) {
      if (index < 0 || index >= this.chapterTexts.length) return
      this.chapterTexts[index].title = title
      this._rebuildFromChapters()
      this._save()
    },

    addChapter() {
      const idx = this.chapterCount + 1
      this.chapterTexts.push({ title: `第${idx}章`, content: '' })
      this._rebuildFromChapters()
      this._save()
    },

    removeChapter(index) {
      if (this.chapterTexts.length <= 1) {
        this.error = '至少保留一个章节'
        return
      }
      this.chapterTexts.splice(index, 1)
      this._rebuildFromChapters()
      this._save()
    },

    moveChapter(from, to) {
      if (from === to) return
      const item = this.chapterTexts.splice(from, 1)[0]
      this.chapterTexts.splice(to, 0, item)
      this._rebuildFromChapters()
      this._save()
    },

    autoSplitIntoThree() {
      const paragraphs = this.novelText
        .split(/\n\s*\n/)
        .map(s => s.trim())
        .filter(Boolean)

      if (paragraphs.length < 3) {
        this.error = '文本段落数不足 3 段，无法自动分割'
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
      const result = splitIntoChapterTexts(text)
      this.chapterTexts = result.chapters
      this.chapterCount = result.chapters.length
      if (result.novelTitle && !this.metadata.title) {
        this.metadata.title = result.novelTitle
      }
      this.chapters = parseNovel(text)
      this.inputMode = 'chapters'
      this.error = null
      this._save()
    },

    /* ===== 内部重建 ===== */
    _rebuildFromChapters() {
      this.novelText = this.chapterTexts
        .map(ch => ch.title ? `${ch.title}\n${ch.content}` : ch.content)
        .join('\n\n')
      this.chapterCount = this.chapterTexts.length
      this.chapters = parseNovel(this.novelText)
    },

    /* ===== API 配置 ===== */
    setApiKey(key) {
      this.apiKey = key
      if (this.rememberKey) storage.setRaw(API_KEY_STORAGE, key)
    },
    setRememberKey(val) {
      this.rememberKey = val
      if (val) { storage.setRaw(API_KEY_STORAGE, this.apiKey) } else { storage.remove(API_KEY_STORAGE) }
    },
    setIncrementalMode(val) {
      this.incrementalMode = val
      storage.set(CONFIG_KEY, { incrementalMode: val })
    },
    setModel(model) { this.model = model },
    setEndpoint(ep) { this.endpoint = ep },

    /* ===== 解析 YAML ===== */
    _parseYamlToScreenplay(yamlString) {
      try {
        const cleanYaml = yamlString
          .split('\n')
          .filter(line => !line.trim().startsWith('#'))
          .join('\n')
          .trim()
        if (!cleanYaml) return null
        return yaml.load(cleanYaml)
      } catch {
        return null
      }
    },

    /* ===== 生成摘要 ===== */
    _updateContextSummary() {
      if (this.screenplay && this.incrementalMode) {
        this.contextSummary = buildContextSummary(this.screenplay)
      }
    },

    /* ===== 统一的 AI 转换 ===== */
    async _runAIConversionInternal(chapters, mode = 'full') {
      this.error = null
      this.convertProgress = 0
      this.currentConvertingChapter = ''

      if (!this.novelText.trim()) { this.error = '请先输入小说文本'; return false }
      if (!this.apiKey) { this.error = '请先配置 API Key'; return false }
      if (chapters.length === 0) { this.error = '没有可转换的章节'; return false }
      if (mode === 'incremental' && !this.screenplay) { this.error = '没有已有剧本，请先进行首次转换'; return false }

      this.isConverting = true

      try {
        const meta = { title: this.metadata.title || '', author: this.metadata.author || '', source: this.metadata.source || '' }

        this.currentConvertingChapter = mode === 'full'
          ? `全量转换 (${chapters.length} 章)`
          : `增量转换 (${chapters.length} 章)`
        this.convertProgress = 10

        const result = await convertWithAI(chapters, {
          apiKey: this.apiKey,
          model: this.model,
          endpoint: this.endpoint,
          metadata: meta,
          contextSummary: mode === 'incremental' ? this.contextSummary : '',
          temperature: 0.3,
          maxTokens: 8192,
          timeout: 120000,
        })

        this.convertProgress = 90

        if (!result.success) {
          this.error = result.error
          return false
        }

        if (mode === 'full') {
          // 全量：直接赋值
          this.yamlOutput = result.yaml
          this.screenplay = this._parseYamlToScreenplay(result.yaml)
        } else {
          // 增量：合并到已有剧本
          const newScreenplay = this._parseYamlToScreenplay(result.yaml)
          if (newScreenplay?.screenplay?.acts?.length) {
            const existingActs = this.screenplay.screenplay?.acts || []
            const existingChars = this.screenplay.screenplay?.characters || []
            const newChars = newScreenplay.screenplay?.characters || []

            const charMap = new Map(existingChars.map(c => [c.id, c]))
            newChars.forEach(c => { if (!charMap.has(c.id)) charMap.set(c.id, c) })

            this.screenplay = {
              screenplay: {
                ...this.screenplay.screenplay,
                title: this.screenplay.screenplay?.title || meta.title,
                characters: Array.from(charMap.values()),
                acts: [...existingActs, ...newScreenplay.screenplay.acts],
              },
            }
            this.yamlOutput = buildYamlOutput(this.screenplay)
          } else {
            // 增量结果解析失败，回退新输出
            this.yamlOutput = result.yaml
            this.screenplay = newScreenplay
          }
        }

        this._updateContextSummary()
        this.convertProgress = 100
        this._save()
        return true
      } catch (err) {
        this.error = `AI 转换失败: ${err.message}`
        return false
      } finally {
        this.isConverting = false
        this.convertProgress = 0
        this.currentConvertingChapter = ''
      }
    },

    /* ===== 对外公开的转换入口 ===== */
    async runAIConversion() {
      return this._runAIConversionInternal(this.chapterTexts, 'full')
    },

    async runAIIncrementalConversion() {
      return this._runAIConversionInternal(this.pendingChapters, 'incremental')
    },

    async runAIConversionSmart() {
      if (this.incrementalMode && this.screenplay && this.pendingChapters.length > 0) {
        return this.runAIIncrementalConversion()
      }
      return this.runAIConversion()
    },

    /* ===== 本地转换（不调用 API） ===== */
    async runLocalConversion() {
      this.error = null
      if (!this.novelText.trim()) { this.error = '请先输入小说文本'; return false }

      this.isConverting = true
      try {
        const chapters = parseNovel(this.novelText)
        if (chapters.length === 0) { this.error = '未能识别到有效章节内容'; return false }
        this.chapters = chapters
        this.chapterCount = chapters.length

        const meta = { title: this.metadata.title || '', author: this.metadata.author || '', source: this.metadata.source || '' }
        this.screenplay = convertNovelToScreenplay(chapters, meta)
        this.yamlOutput = buildYamlOutput(this.screenplay)
        this.contextSummary = ''
        this._save()
        return true
      } catch (err) {
        this.error = `转换失败: ${err.message}`
        return false
      } finally {
        this.isConverting = false
      }
    },

    /* ===== 清空 ===== */
    clearAll() {
      this.novelText = ''
      this.metadata = { title: '', author: '', source: '' }
      this.chapterTexts = []
      this.chapterCount = 0
      this.chapters = []
      this.screenplay = null
      this.yamlOutput = ''
      this.contextSummary = ''
      this.error = null
      this.inputMode = 'input'
      this.convertProgress = 0
      this.currentConvertingChapter = ''
      storage.remove(STATE_KEY)
    },

    /* ===== 持久化 ===== */
    _save() {
      storage.set(STATE_KEY, {
        novelText: this.novelText,
        chapterTexts: this.chapterTexts,
        metadata: this.metadata,
        yamlOutput: this.yamlOutput,
        screenplay: this.screenplay,
        contextSummary: this.contextSummary,
      })
    },
  },
})
