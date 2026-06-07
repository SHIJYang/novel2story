/**
 * stores/novel.js - 小说状态管理（持久化 + 章节管理）
 */
import { defineStore } from 'pinia'
import { parseNovel, splitIntoChapterTexts } from '@/utils/novelParser.js'
import { convertNovelToScreenplay, buildYamlOutput, extractChapterScreenplay, buildChapterYamlOutput, mergeChapterResults, buildCharactersYaml, buildContextSummary } from '@/utils/converter.js'
import { convertChapterWithAI } from '@/api/converter.js'
import yaml from 'js-yaml'

const STATE_KEY = 'novel2story_state'
const API_KEY_STORAGE = 'sk-6zRjJlpnuNlHGLiCkNJqEfUBzMtuzqXqYqDrF0qG8eJOEXkO'

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
    return {
      novelText: saved?.novelText || '',
      metadata: saved?.metadata || { title: '', author: '', source: '' },

      chapterTexts: saved?.chapterTexts || [],
      chapterCount: saved?.chapterTexts?.length || 0,

      chapters: [],

      /* 全局剧本 */
      screenplay: saved?.screenplay || null,
      globalYaml: saved?.globalYaml || '',

      /* 每章独立剧本 */
      chapterScreenplays: saved?.chapterScreenplays || [],
      chapterYamls: saved?.chapterYamls || [],

      isConverting: false,
      error: null,

      apiKey: storage.getRaw(API_KEY_STORAGE) || '',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      model: 'deepseek-v4-flash',
      rememberKey: !!storage.getRaw(API_KEY_STORAGE),

      inputMode: 'input',
      convertProgress: 0,
      currentConvertingChapter: '',

      /* 当前分章预览索引 */
      activeChapterIndex: 0,
    }
  },

  getters: {
    hasResult: (s) => !!s.globalYaml,
    characters: (s) => s.screenplay?.screenplay?.characters ?? [],
    chaptersEnough: (s) => s.chapterCount >= 3,

    convertedActCount: (s) => s.screenplay?.screenplay?.acts?.length || 0,

    /* 当前正在预览的分章剧本 */
    currentChapterSc: (s) => s.chapterScreenplays[s.activeChapterIndex] || null,
    currentChapterYaml: (s) => s.chapterYamls[s.activeChapterIndex] || '',
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

    /* ===== 从全局剧本提取分章剧本 ===== */
    _buildChapterScreenplays() {
      if (!this.screenplay?.screenplay?.acts?.length) {
        this.chapterScreenplays = []
        this.chapterYamls = []
        return
      }
      const acts = this.screenplay.screenplay.acts
      const scs = []
      const yamls = []
      for (let i = 0; i < acts.length; i++) {
        const chSc = extractChapterScreenplay(this.screenplay, i)
        if (chSc) {
          scs.push(chSc)
          yamls.push(buildChapterYamlOutput(chSc, i))
        }
      }
      this.chapterScreenplays = scs
      this.chapterYamls = yamls
    },

    /* ===== AI 转换（逐章请求 + 上下文传递，保证详尽） ===== */
    async runAIConversion() {
      this.error = null
      this.convertProgress = 0
      this.currentConvertingChapter = ''

      if (!this.novelText.trim()) { this.error = '请先输入小说文本'; return false }
      if (!this.apiKey) { this.error = '请先配置 API Key'; return false }
      if (this.chapterTexts.length === 0) { this.error = '没有可转换的章节'; return false }

      this.isConverting = true

      // 临时存储逐章结果
      const chapterResults = []

      try {
        const meta = { title: this.metadata.title || '', author: this.metadata.author || '', source: this.metadata.source || '' }

        for (let i = 0; i < this.chapterTexts.length; i++) {
          const ch = this.chapterTexts[i]
          this.currentConvertingChapter = `第${i + 1}章: ${ch.title || `第${i + 1}章`}`
          this.convertProgress = Math.round(((i) / this.chapterTexts.length) * 80)

          // 构造前文摘要
          let contextSummary = ''
          let charactersYaml = ''
          if (chapterResults.length > 0) {
            // 用已处理章节合并后的临时全局剧本生成摘要
            const tempMerged = mergeChapterResults(chapterResults, meta)
            contextSummary = buildContextSummary(tempMerged)
            charactersYaml = buildCharactersYaml(tempMerged)
          }

          const result = await convertChapterWithAI(ch, {
            apiKey: this.apiKey,
            model: this.model,
            endpoint: this.endpoint,
            metadata: meta,
            contextSummary,
            charactersYaml,
            chapterIndex: i + 1,
            temperature: 0.3,
            maxTokens: 32768,
            timeout: 180000,
          })

          if (!result.success) {
            this.error = `第${i + 1}章转换失败: ${result.error}`
            return false
          }

          chapterResults.push({
            yaml: result.yaml,
            parsed: this._parseYamlToScreenplay(result.yaml),
          })
        }

        // ---- 所有章节转换完毕，合并为全局剧本 ----
        this.convertProgress = 95
        this.currentConvertingChapter = '合并全局剧本...'

        const merged = mergeChapterResults(chapterResults, meta)
        this.screenplay = merged
        this.globalYaml = buildYamlOutput(merged)

        // ---- 从合并后的全局剧本生成各章独立剧本 ----
        this._buildChapterScreenplays()

        this.convertProgress = 100
        this.currentConvertingChapter = ''
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
        this.globalYaml = buildYamlOutput(this.screenplay)

        // 提取每章独立剧本
        this._buildChapterScreenplays()

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
      this.globalYaml = ''
      this.chapterScreenplays = []
      this.chapterYamls = []
      this.error = null
      this.inputMode = 'input'
      this.convertProgress = 0
      this.currentConvertingChapter = ''
      this.activeChapterIndex = 0
      storage.remove(STATE_KEY)
    },

    /* ===== 持久化 ===== */
    _save() {
      storage.set(STATE_KEY, {
        novelText: this.novelText,
        chapterTexts: this.chapterTexts,
        metadata: this.metadata,
        globalYaml: this.globalYaml,
        screenplay: this.screenplay,
        chapterScreenplays: this.chapterScreenplays,
        chapterYamls: this.chapterYamls,
      })
    },
  },
})
