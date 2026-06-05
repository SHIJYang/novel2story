/**
 * converter.js - 小说到剧本转换引擎
 */
import { ParagraphType, generateSceneHeading } from './novelParser.js'

const SCENE_WINDOW_SIZE = 5

export function convertNovelToScreenplay(chapters, metadata = {}) {
  const screenplay = {
    screenplay: {
      title: metadata.title || '未命名剧本',
      author: metadata.author || '',
      source: metadata.source || '',
      sourceChapters: chapters.length,
      createdAt: new Date().toISOString().split('T')[0],
      version: '1.0.0',
      characters: extractCharacters(chapters),
      acts: [],
    },
  }

  for (let ci = 0; ci < chapters.length; ci++) {
    const act = buildAct(chapters[ci], ci, screenplay.screenplay.characters)
    screenplay.screenplay.acts.push(act)
  }

  return screenplay
}

function buildAct(chapter, chapterIndex, characters) {
  const act = {
    id: `act_${String(chapterIndex + 1).padStart(3, '0')}`,
    title: chapter.title || `第${chapterIndex + 1}章`,
    summary: '',
    scenes: [],
  }

  const charMap = new Map(characters.map(c => [c.name, c.id]))
  let currentScene = null
  let actionBuffer = []

  function flushBuffer() {
    if (actionBuffer.length === 0 || !currentScene) return
    const combined = actionBuffer.map(p => p.text).join('\n').replace(/[「"][^」"]*[」"]/g, '').trim()
    if (combined) currentScene.elements.push({ type: 'action', content: combined })
    actionBuffer = []
  }

  function startScene(para) {
    flushBuffer()
    const info = para.sceneInfo || {}
    const heading = generateSceneHeading(info.location, info.time)
    currentScene = {
      id: `scn_${String(chapterIndex + 1).padStart(3, '0')}_${String(act.scenes.length + 1).padStart(3, '0')}`,
      heading,
      location: info.location || '未知地点',
      time: info.time || '不确定',
      summary: '',
      characters: [],
      elements: [],
    }
    act.scenes.push(currentScene)
  }

  for (let pi = 0; pi < chapter.paragraphs.length; pi++) {
    const para = chapter.paragraphs[pi]

    if (para.type === ParagraphType.SCENE_HEADER) { startScene(para); continue }
    if (para.type === ParagraphType.TRANSITION) {
      flushBuffer()
      if (currentScene) currentScene.elements.push({ type: 'transition', content: para.transition || 'CUT TO:' })
      const next = chapter.paragraphs[pi + 1]
      if (next && next.type === ParagraphType.ACTION) { startScene(next); pi++; continue }
      continue
    }
    if (para.type === ParagraphType.DIALOGUE) {
      flushBuffer()
      if (!currentScene) startScene({ sceneInfo: {} })
      processDialogue(para, currentScene, charMap, characters)
      continue
    }
    if (para.type === ParagraphType.ACTION || para.type === ParagraphType.UNKNOWN) {
      if (!currentScene) startScene({ sceneInfo: {} })
      actionBuffer.push(para)
      if (actionBuffer.length >= SCENE_WINDOW_SIZE) {
        const next = chapter.paragraphs[pi + 1]
        if (next && next.type !== ParagraphType.ACTION) flushBuffer()
      }
    }
  }

  flushBuffer()
  if (act.scenes.length === 0) {
    act.scenes.push({
      id: `scn_${String(chapterIndex + 1).padStart(3, '0')}_001`,
      heading: 'INT. 场景 - 日', location: '场景', time: '日',
      summary: '', characters: [], elements: [],
    })
  }
  return act
}

function processDialogue(para, scene, charMap, characters) {
  const dialogues = para.dialogues || []
  const attributions = para.attributions || []

  for (const attr of attributions) {
    if (!charMap.has(attr.character)) {
      const id = `char_${String(characters.length + 1).padStart(3, '0')}`
      characters.push({ id, name: attr.character, alias: [], description: '', role: 'supporting', arc: '' })
      charMap.set(attr.character, id)
    }
    const cid = charMap.get(attr.character)
    if (!scene.characters.includes(cid)) scene.characters.push(cid)
  }

  let remaining = para.text

  for (const d of dialogues) {
    let speakerName = ''
    for (const attr of attributions) {
      if (attr.character && remaining.indexOf(attr.character) < d.index + 10) {
        speakerName = attr.character; break
      }
    }
    if (!speakerName) speakerName = inferSpeaker(scene, charMap)

    let speakerId = ''
    if (speakerName && charMap.has(speakerName)) {
      speakerId = charMap.get(speakerName)
      if (!scene.characters.includes(speakerId)) scene.characters.push(speakerId)
    }

    const before = remaining.substring(0, d.index)
      .replace(/[、，。：:！？\s]+$/, '').replace(/[\u4e00-\u9fff]{2,4}[说道问答喊叫]/g, '').trim()
    if (before && before.length > 2) scene.elements.push({ type: 'action', content: before })

    scene.elements.push({
      type: 'dialogue',
      character: speakerId || '',
      content: d.content,
      parenthetical: extractParen(remaining, d),
    })

    remaining = remaining.substring(d.index + d.content.length + 2)
  }

  const after = remaining.replace(/[」"』]/g, '').replace(/[\u4e00-\u9fff]{2,4}[说道问答喊叫]/g, '').trim()
  if (after && after.length > 2) scene.elements.push({ type: 'action', content: after })
}

function inferSpeaker(scene, charMap) {
  if (charMap.size === 0) return ''
  if (charMap.size === 1) return Array.from(charMap.keys())[0]
  const last = [...scene.elements].reverse().find(e => e.type === 'dialogue')
  if (!last) return Array.from(charMap.keys())[0]
  const chars = Array.from(charMap.entries())
  const other = chars.find(([_, id]) => id !== last.character)
  return other ? other[0] : chars[0]?.[0] || ''
}

function extractParen(text, dialogue) {
  const before = text.substring(0, dialogue.index).match(/[（(]([^）)]{1,20})[）)]/)
  if (before) return before[1]
  const after = text.substring(dialogue.index + dialogue.content.length).match(/[（(]([^）)]{1,20})[）)]/)
  return after ? after[1] : ''
}

function extractCharacters(chapters) {
  const map = new Map()
  let idx = 0
  const counts = {}

  for (const ch of chapters) {
    for (const p of ch.paragraphs) {
      for (const a of (p.attributions || [])) {
        const name = a.character
        if (name.length >= 2 && name.length <= 6) {
          counts[name] = (counts[name] || 0) + 1
          if (!map.has(name)) {
            idx++
            map.set(name, { id: `char_${String(idx).padStart(3, '0')}`, name, alias: [], description: '', role: 'supporting', arc: '' })
          }
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => (counts[b.name] || 0) - (counts[a.name] || 0))
    .map((c, i) => {
      c.role = i === 0 ? 'protagonist' : i <= 2 ? 'antagonist' : i <= 5 ? 'supporting' : 'minor'
      return c
    })
}

export function buildYamlOutput(screenplayObj) {
  const s = screenplayObj.screenplay
  const lines = []
  lines.push('screenplay:')
  lines.push(`  title: "${escapeYaml(s.title)}"`)
  lines.push(`  author: "${escapeYaml(s.author)}"`)
  lines.push(`  source: "${escapeYaml(s.source)}"`)
  lines.push(`  sourceChapters: ${s.sourceChapters}`)
  lines.push(`  createdAt: "${s.createdAt}"`)
  lines.push(`  version: "${s.version}"`)
  lines.push('')
  lines.push('  characters:')
  for (const c of s.characters) {
    lines.push(`    - id: "${c.id}"`)
    lines.push(`      name: "${escapeYaml(c.name)}"`)
    if (c.alias?.length) lines.push(`      alias: [${c.alias.map(a => `"${escapeYaml(a)}"`).join(', ')}]`)
    lines.push(`      description: "${escapeYaml(c.description)}"`)
    lines.push(`      role: ${c.role}`)
    if (c.arc) lines.push(`      arc: "${escapeYaml(c.arc)}"`)
  }
  lines.push('')
  lines.push('  acts:')
  for (const act of s.acts) {
    lines.push(`    - id: "${act.id}"`)
    lines.push(`      title: "${escapeYaml(act.title)}"`)
    lines.push(`      summary: "${escapeYaml(act.summary)}"`)
    lines.push('      scenes:')
    for (const scn of act.scenes) {
      lines.push(`        - id: "${scn.id}"`)
      lines.push(`          heading: "${escapeYaml(scn.heading)}"`)
      lines.push(`          location: "${escapeYaml(scn.location)}"`)
      lines.push(`          time: "${escapeYaml(scn.time)}"`)
      lines.push(`          summary: "${escapeYaml(scn.summary)}"`)
      lines.push(`          characters: [${scn.characters.map(c => `"${c}"`).join(', ')}]`)
      lines.push('          elements:')
      for (const el of scn.elements) {
        lines.push(`            - type: ${el.type}`)
        if (el.type === 'dialogue') {
          lines.push(`              character: "${el.character}"`)
          if (el.parenthetical) lines.push(`              parenthetical: "${escapeYaml(el.parenthetical)}"`)
          lines.push(`              content: "${escapeYaml(el.content)}"`)
        } else {
          const c = el.content || ''
          if (c.includes('\n')) {
            lines.push('              content: >-')
            for (const l of c.split('\n')) lines.push(`                ${escapeYaml(l)}`)
          } else {
            lines.push(`              content: "${escapeYaml(c)}"`)
          }
        }
      }
    }
  }
  return lines.join('\n')
}

function escapeYaml(str) {
  if (!str) return ''
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t')
}
