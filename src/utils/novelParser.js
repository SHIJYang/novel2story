/**
 * novelParser.js - 小说文本解析引擎
 */
export const ParagraphType = {
  CHAPTER_HEADER: 'chapter_header',
  SCENE_HEADER: 'scene_header',
  DIALOGUE: 'dialogue',
  ACTION: 'action',
  TRANSITION: 'transition',
  UNKNOWN: 'unknown',
}

const CHAPTER_PATTERNS = [
  /^#{1,3}\s*(第[一二三四五六七八九十百千\d]+[章节回部])/gm,
  /^(第[一二三四五六七八九十百千\d]+[章节回部])/gm,
  /^(Chapter|CHAPTER|Ch\.?)\s*(\d+)/gm,
]
export function parseNovel(text) {
  if (!text || text.trim().length === 0) return []

  const lines = text.split('\n')
  const chapters = []
  let currentChapter = null
  let currentBuffer = []

  function flushBuffer() {
    if (currentBuffer.length > 0 && currentChapter) {
      const paragraphs = parseParagraphs(currentBuffer)
      currentChapter.paragraphs.push(...paragraphs)
      currentBuffer = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const chapterMatch = detectChapterHeader(line)
    if (chapterMatch) {
      flushBuffer()
      if (currentChapter) chapters.push(currentChapter)
      currentChapter = { title: chapterMatch, index: chapters.length + 1, paragraphs: [] }
      continue
    }

    if (currentChapter === null) {
      currentChapter = { title: '未命名章节', index: 1, paragraphs: [] }
    }
    currentBuffer.push(line)
  }

  flushBuffer()
  if (currentChapter) chapters.push(currentChapter)
  return chapters
}

function detectChapterHeader(line) {
  for (const pattern of CHAPTER_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(line)
    if (match) {
      if (match[1] && match[1].length >= 2) return match[1]
      if (match[0] && match[0].length >= 2) return match[0]
    }
  }
  return null
}

/** 去掉行首 # 号和空白，保留剩余文本作为章节标题 */
function stripChapterMarks(line) {
  return line.replace(/^[#]+\s*/, '').trim()
}


/** 按章节标题分割原始文本，返回 { chapters, novelTitle }
 *  novelTitle：正文前独立一行的小说名，自动识别 */
export function splitIntoChapterTexts(text) {
  if (!text || !text.trim()) return { chapters: [], novelTitle: '' }

  const lines = text.split('\n')
  const chapters = []
  let current = { title: '', lines: [] }
  let novelTitle = ''
  let preamble = []  // 第一个章节标题出现之前的行
  let firstChapterFound = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    if (detectChapterHeader(trimmed)) {
      if (!firstChapterFound) {
        // 第一次遇到章节标题：检查 preamble 里的第一行短文本是否是书名
        firstChapterFound = true
        const nonEmptyPreamble = preamble.map(l => l.trim()).filter(Boolean)
        if (nonEmptyPreamble.length === 1) {
          const candidate = nonEmptyPreamble[0]
          if (candidate.length >= 2 && candidate.length <= 30 && !detectChapterHeader(candidate)) {
            novelTitle = candidate
            preamble = []
          }
        }
        // 剩余 preamble 内容归入第一章
        current.lines.push(...preamble)
      }
      if (current.lines.length > 0 || current.title) {
        chapters.push({ title: current.title, content: current.lines.join('\n').trim() })
      }
      current = { title: stripChapterMarks(trimmed), lines: [] }
      continue
    }

    if (!firstChapterFound) {
      preamble.push(lines[i])
    } else {
      current.lines.push(lines[i])
    }
  }

  if (current.lines.length > 0 || current.title) {
    chapters.push({ title: current.title, content: current.lines.join('\n').trim() })
  }

  // 没有章节标题，整篇当一章
  if (chapters.length === 0 && lines.some(l => l.trim())) {
    chapters.push({ title: '', content: lines.map(l => l.trim()).filter(Boolean).join('\n') })
  }

  return { chapters, novelTitle }
}

export function generateSceneHeading(location, time) {
  const loc = location || '未知地点'
  const intExt = loc.match(/外|户外|露天|花园|街道|马路|广场|公园|海边|山上|田野|森林/) ? 'EXT' : 'INT'
  return `${intExt}. ${loc} - ${time || '不确定时间'}`
}
