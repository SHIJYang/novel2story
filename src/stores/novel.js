/**
 * stores/novel.js - 小说状态管理（持久化 + 章节管理）
 */
import { defineStore } from 'pinia'
import { parseNovel, splitIntoChapterTexts } from '@/utils/novelParser.js'
import { buildYamlOutput, extractChapterScreenplay, buildChapterYamlOutput, mergeChapterResults, buildCharactersYaml, buildContextSummary } from '@/utils/converter.js'
import { convertChapterWithAI, parseStructuredYaml } from '@/api/converter.js'
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

      /* 逐章转换状态 */
      chapterSummaries: saved?.chapterSummaries || [],
      chapterConverted: saved?.chapterConverted || [],
      singleChapterConverting: false,

      /* 当前分章预览索引 */
      activeChapterIndex: 0,
    }
  },

  getters: {
    hasResult: (s) => !!s.globalYaml || s.chapterConverted?.some(Boolean),
    characters: (s) => s.screenplay?.screenplay?.characters ?? [],
    chaptersEnough: (s) => s.chapterCount >= 3,

    convertedActCount: (s) => s.screenplay?.screenplay?.acts?.length || 0,

    /* 当前正在预览的分章剧本 */
    currentChapterSc: (s) => s.chapterScreenplays[s.activeChapterIndex] || null,
    currentChapterYaml: (s) => s.chapterYamls[s.activeChapterIndex] || '',
    convertedChapters: (s) => s.chapterTexts.map((_, i) => !!s.chapterConverted[i]),
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

    /* ===== AI 批量转换（全部章节） ===== */
    async runAIConversion() {
      this.error = null
      this.convertProgress = 0
      this.currentConvertingChapter = ''

      if (!this.novelText.trim()) { this.error = '请先输入小说文本'; return false }
      if (!this.apiKey) { this.error = '请先配置 API Key'; return false }
      if (this.chapterTexts.length === 0) { this.error = '没有可转换的章节'; return false }

      this.isConverting = true

      // 先重置逐章状态
      this.chapterSummaries = []
      this.chapterConverted = []
      this.chapterScreenplays = []
      this.chapterYamls = []

      try {
        const meta = { title: this.metadata.title || '', author: this.metadata.author || '', source: this.metadata.source || '' }

        for (let i = 0; i < this.chapterTexts.length; i++) {
          const ch = this.chapterTexts[i]
          this.currentConvertingChapter = `第${i + 1}章: ${ch.title || `第${i + 1}章`}`
          this.convertProgress = Math.round(((i) / this.chapterTexts.length) * 80)

          // 构造前文摘要和角色表
          const contextParts = []
          for (let j = 0; j < i; j++) {
            if (this.chapterSummaries[j]) contextParts.push(`第${j + 1}章：${this.chapterSummaries[j]}`)
          }
          const contextSummary = i > 0 ? contextParts.join('\n') : ''

          const accumulatedChars = []
          for (let j = 0; j < i; j++) {
            const sc = this.chapterScreenplays[j]
            if (sc?.screenplay?.characters) {
              for (const c of sc.screenplay.characters) {
                const exists = accumulatedChars.find(e => e.id === c.id)
                if (!exists) accumulatedChars.push({ ...c })
              }
            }
          }
          const charactersYaml = accumulatedChars.length > 0
            ? buildCharactersYaml({ screenplay: { characters: accumulatedChars } })
            : ''

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

          // 保存摘要
          this.chapterSummaries[i] = result.summary || ''

          // 构建本章独立剧本
          const sc = result.screenplay
            ? { screenplay: result.screenplay }
            : this._parseYamlToScreenplay(result.yaml)

          if (sc) {
            if (result.characters?.length > 0 && sc.screenplay) {
              sc.screenplay.characters = result.characters
            }
            this.chapterScreenplays[i] = sc
            this.chapterYamls[i] = buildChapterYamlOutput(sc, i)
            this.chapterConverted[i] = true
          } else {
            this.chapterYamls[i] = result.yaml
            this.chapterConverted[i] = true
          }
        }

        // ---- 合并全局剧本 ----
        this.convertProgress = 95
        this.currentConvertingChapter = '合并全局剧本...'
        this._rebuildGlobalFromChapters()

        this.convertProgress = 100
        this.currentConvertingChapter = ''
        this.activeChapterIndex = 0
        this._save()
        return true
      } catch (err) {
        this.error = `转换失败: ${err.message}`
        this.isConverting = false
        return false
      } finally {
        this.isConverting = false
        this.convertProgress = 0
        this.currentConvertingChapter = ''
      }
    },



    /* ===== AI 逐章转换 ===== */
    async runSingleChapterConversion(index) {
      this.error = null
      const ch = this.chapterTexts[index]
      if (!ch) { this.error = '无效章节索引'; return false }
      if (!this.apiKey) { this.error = '请先配置 API Key'; return false }

      this.singleChapterConverting = true
      this.currentConvertingChapter = `${ch.title || `第${index + 1}章`}`

      try {
        // 构造前文：已转换章节的剧情摘要 + 累计角色表
        const contextParts = []
        let charsYaml = ''
        for (let i = 0; i < index; i++) {
          if (this.chapterSummaries[i]) contextParts.push(`第${i + 1}章：${this.chapterSummaries[i]}`)
        }
        const contextSummary = contextParts.join('\n')

        // 从已转换章节中收集累计角色
        const accumulatedChars = []
        for (let i = 0; i < index; i++) {
          const sc = this.chapterScreenplays[i]
          if (sc?.screenplay?.characters) {
            for (const c of sc.screenplay.characters) {
              const exists = accumulatedChars.find(e => e.id === c.id)
              if (!exists) accumulatedChars.push({ ...c })
            }
          }
        }
        if (accumulatedChars.length > 0) {
          charsYaml = buildCharactersYaml({ screenplay: { characters: accumulatedChars } })
        }

        const meta = { title: this.metadata.title || '', author: this.metadata.author || '', source: this.metadata.source || '' }

        const result = await convertChapterWithAI(ch, {
          apiKey: this.apiKey,
          model: this.model,
          endpoint: this.endpoint,
          metadata: meta,
          contextSummary: index > 0 ? contextSummary : '',
          charactersYaml: charsYaml,
          chapterIndex: index + 1,
          temperature: 0.3,
          maxTokens: 32768,
          timeout: 180000,
        })

        if (!result.success) {
          this.error = `第${index + 1}章转换失败: ${result.error}`
          return false
        }

        // 保存本章摘要
        this.chapterSummaries[index] = result.summary || ''

        // 构建本章独立剧本
        const sc = result.screenplay
          ? { screenplay: result.screenplay }
          : this._parseYamlToScreenplay(result.yaml)

        if (sc) {
          // 如果 API 返回了 characters，注入到 screenplay
          if (result.characters?.length > 0 && sc.screenplay) {
            sc.screenplay.characters = result.characters
          }
          this.chapterScreenplays[index] = sc
          this.chapterYamls[index] = buildChapterYamlOutput(sc, index)
          this.chapterConverted[index] = true

          // 更新全局剧本
          this._rebuildGlobalFromChapters()
        } else {
          // fallback: 存原始 YAML
          this.chapterYamls[index] = result.yaml
          this.chapterConverted[index] = true
        }

        // 跳转到本章
        this.activeChapterIndex = index
        this._save()
        return true
      } catch (err) {
        this.error = `转换失败: ${err.message}`
        return false
      } finally {
        this.singleChapterConverting = false
        this.currentConvertingChapter = ''
      }
    },

    /* ===== 从已转换的分章剧本重建全局剧本 ===== */
    _rebuildGlobalFromChapters() {
      const convertedIds = new Set()
      const allChars = []
      const allActs = []

      for (let i = 0; i < this.chapterScreenplays.length; i++) {
        const sc = this.chapterScreenplays[i]
        if (!sc?.screenplay?.acts?.length) continue

        // 角色去重合并
        for (const c of sc.screenplay.characters || []) {
          if (!convertedIds.has(c.id)) {
            convertedIds.add(c.id)
            allChars.push({ ...c })
          }
        }

        // 收集该章的所有 scenes
        for (const act of sc.screenplay.acts) {
          allActs.push({
            ...act,
            scenes: (act.scenes || []).map(s => ({ ...s })),
          })
        }
      }

      if (allActs.length === 0) return

      this.screenplay = {
        screenplay: {
          title: this.metadata.title || '',
          author: this.metadata.author || '',
          source: this.metadata.source || '',
          sourceChapters: this.chapterScreenplays.length,
          createdAt: new Date().toISOString().split('T')[0],
          version: '1.0',
          characters: allChars,
          acts: allActs,
        },
      }

      this.globalYaml = buildYamlOutput(this.screenplay)
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
      this.chapterSummaries = []
      this.chapterConverted = []
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
        chapterSummaries: this.chapterSummaries,
        chapterConverted: this.chapterConverted,
      })
    },
  },
})
