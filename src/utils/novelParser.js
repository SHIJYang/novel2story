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
  /#{1,3}\s*(第[一二三四五六七八九十百千\d]+[章节回部])/g,
  /(第[一二三四五六七八九十百千\d]+[章节回部])/g,
  /(Chapter|CHAPTER|Ch\.?)\s*(\d+)/g,
  /(Part|PART)\s*(I|II|III|IV|V|VI|VII|VIII|IX|X|\d+)/g,
  /^(零|一|二|三|四|五|六|七|八|九|十)\s*$/gm,
]

const DIALOG_PATTERNS = [
  /「([^」]*)」/g,
  /『([^』]*)』/g,
  /"([^"]*)"/g,
  /'([^']*)'/g,
  /^[—\-]\s*(.+)$/gm,
]

const ATTRIBUTION_PATTERNS = [
  /([\u4e00-\u9fff]{2,4})(?:说|道|问|答|喊|叫|骂|抱怨|嘀咕|解释|吩咐|告诉|回应|感叹|自言自语)([：:,，])\s*/g,
  /[「"]([^」"]*)[」"]\s*，?\s*([\u4e00-\u9fff]{2,4})(?:说|道|问|答)/g,
]

const LOCATION_PATTERNS = [
  /在([\u4e00-\u9fff]{2,10})(?:里|外|上|下|中|内|旁|前|后|附近|门口|旁边|角落)/,
  /来到(?:了)?([\u4e00-\u9fff]{2,10})/,
  /走进(?:了)?([\u4e00-\u9fff]{2,10})/,
  /(?:到了|到达|抵达)([\u4e00-\u9fff]{2,10})/,
  /房间|客厅|卧室|厨房|书房|阳台|花园|街道|马路|公园|餐厅|咖啡[馆厅]|酒吧|学校|教室|办公室|医院|车站|机场|广场|商场|超市|河边|海边|山顶|树下|门口|天台|地下室|车库|走廊|大厅|舞台|后台|剧场|电影院|寺庙|教堂|城堡|宫殿|花园|森林|沙漠|岛屿|船上|车内|飞机上/,
]

const TIME_PATTERNS = [
  /清晨|早晨|早上|上午|中午|午后|下午|傍晚|黄昏|日落|夜晚|晚上|夜里|深夜|凌晨|半夜|午夜/,
  /天亮|日出|天黑|入夜|夜深|破晓|黎明|拂晓|曙光|暮色|夜色/,
  /(\d{1,2})[：:点](\d{2})?[分]?/,
]

const TRANSITION_PATTERNS = [
  /与此同时|另一[边面]|镜头切换|画面转到|时间[回到转到]|转场|闪回|回忆|同一时刻/,
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

function parseParagraphs(lines) {
  return lines.map(line => parseParagraph(line)).filter(Boolean)
}

function parseParagraph(line) {
  const text = line.trim()
  if (!text) return null

  const dialogues = extractDialogues(text)
  const attributions = extractAttributions(text)
  const sceneInfo = detectSceneChange(text)
  const transition = detectTransition(text)

  let type = ParagraphType.UNKNOWN
  if (dialogues.length > 0) type = ParagraphType.DIALOGUE
  else if (sceneInfo.isSceneHeader) type = ParagraphType.SCENE_HEADER
  else if (transition) type = ParagraphType.TRANSITION
  else type = ParagraphType.ACTION

  return { type, text, dialogues, attributions, sceneInfo, transition }
}

function extractDialogues(text) {
  const result = []
  for (const pattern of DIALOG_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      result.push({
        content: match[1] || match[0].replace(/^[—\-]\s*/, ''),
        index: match.index,
      })
    }
  }
  return result
}

function extractAttributions(text) {
  const result = []
  for (const pattern of ATTRIBUTION_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      if (match[1]) result.push({ character: match[1].trim(), suffix: match[2] || '' })
    }
  }
  return result
}

function detectSceneChange(text) {
  let location = ''
  let time = ''
  let isSceneHeader = false

  for (const pattern of LOCATION_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (match) {
      location = match[1] || match[0].replace(/[。，、]/g, '').trim()
      if (location.length <= 10) { isSceneHeader = true; break }
    }
  }
  for (const pattern of TIME_PATTERNS) {
    pattern.lastIndex = 0
    const match = pattern.exec(text)
    if (match) { time = match[0]; isSceneHeader = true; break }
  }
  return { location, time, isSceneHeader }
}

function detectTransition(text) {
  for (const pattern of TRANSITION_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(text)) { pattern.lastIndex = 0; const m = pattern.exec(text); return m ? m[0] : null }
  }
  return null
}

export function generateSceneHeading(location, time) {
  const intExt = location.match(/外|户外|露天|花园|街道|马路|广场|公园|海边|山上|田野|森林/) ? 'EXT' : 'INT'
  return `${intExt}. ${location || '未知地点'} - ${time || '不确定时间'}`
}
