/**
 * stores/novel.js - 小说状态管理（持久化 + 章节管理）
 */
import { defineStore } from 'pinia'
import { parseNovel, splitIntoChapterTexts } from '@/utils/novelParser.js'
import { convertNovelToScreenplay, buildYamlOutput } from '@/utils/converter.js'

const STATE_KEY = 'novel2story_state'
const API_KEY   = 'novel2story_apikey'

/* ===== 持久化 ===== */
function loadSavedState() {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return null
}

function saveState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      novelText: state.novelText,
      chapterTexts: state.chapterTexts,
      metadata: state.metadata,
      yamlOutput: state.yamlOutput,
      screenplay: state.screenplay,
    }))
  } catch { /* ignore */ }
}

function loadApiKey() {
  try { return localStorage.getItem(API_KEY) || '' } catch { return '' }
}
function saveApiKey(key) { try { localStorage.setItem(API_KEY, key) } catch { /* ignore */ } }
function removeApiKey() { try { localStorage.removeItem(API_KEY) } catch { /* ignore */ } }

export const useNovelStore = defineStore('novel', {
  state: () => {
    const saved = loadSavedState()
    return {
      // 输入
      novelText: saved?.novelText || '',
      metadata: saved?.metadata || { title: '', author: '', source: '' },

      // 章节管理
      chapterTexts: saved?.chapterTexts || [],    // [{title, content}]
      chapterCount: saved?.chapterTexts?.length || 0,

      // 解析结果（结构化，只读，基于 chapterTexts 生成）
      chapters: [],
      screenplay: saved?.screenplay || null,
      yamlOutput: saved?.yamlOutput || '',

      // 转换状态
      isConverting: false,
      error: null,

      // API 配置（独立存储）
      apiKey: loadApiKey(),
      model: 'gpt-3.5-turbo',
      rememberKey: !!loadApiKey(),

      // UI 状态
      inputMode: 'input',   // 'input' | 'chapters'
    }
  },

  getters: {
    hasResult:     (s) => !!s.yamlOutput,
    characters:   (s) => s.screenplay?.screenplay?.characters ?? [],
    chaptersEnough: (s) => s.chapterCount >= 3,
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

    // 切换到章节管理模式
    enterChapterMode() {
      if (this.chapterTexts.length > 0) this.inputMode = 'chapters'
    },

    // 返回原始输入模式
    enterInputMode() {
      this.inputMode = 'input'
    },

    /* ===== 章节 CRUD ===== */
    updateChapterContent(index, content) {
      if (index < 0 || index >= this.chapterTexts.length) return
      this.chapterTexts[index].content = content
      // 重建完整文本并重解析
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

    // 自动分割
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
      // 从 chapterTexts 拼接完整文本
      this.novelText = this.chapterTexts
        .map(ch => ch.title ? `${ch.title}\n${ch.content}` : ch.content)
        .join('\n\n')
      this.chapterCount = this.chapterTexts.length
      this.chapters = parseNovel(this.novelText)
    },

    /* ===== API 配置 ===== */
    setApiKey(key) {
      this.apiKey = key
      if (this.rememberKey) saveApiKey(key)
    },
    setModel(model) { this.model = model },
    setRememberKey(val) {
      this.rememberKey = val
      if (val) { saveApiKey(this.apiKey) } else { removeApiKey() }
    },

    /* ===== 转换 ===== */
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
          this.error = '未能识别到有效章节内容'
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
        this._save()
        return true
      } catch (err) {
        this.error = `转换失败: ${err.message}`
        return false
      } finally {
        this.isConverting = false
      }
    },

    /* ===== 持久化 ===== */
    _save() {
      saveState(this)
    },

    clearAll() {
      this.novelText = ''
      this.metadata = { title: '', author: '', source: '' }
      this.chapterTexts = []
      this.chapterCount = 0
      this.chapters = []
      this.screenplay = null
      this.yamlOutput = ''
      this.error = null
      this.inputMode = 'input'
      localStorage.removeItem(STATE_KEY)
    },
  },
})
