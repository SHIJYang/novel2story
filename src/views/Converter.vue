<template>
  <div class="converter">
    <div class="two-column">
      <!-- ===== 左栏 ===== -->
      <div class="col col-input">
        <div class="panel">
          <!-- 标题 -->
          <div class="panel-title">
            <span>📄 {{ inputTitle }}</span>
            <el-tag v-if="store.inputMode === 'input'" size="small" type="warning" effect="plain">需 ≥ 3 章</el-tag>
            <div style="flex:1" />
            <template v-if="store.chapterTexts.length >= 0">
              <el-button v-if="store.inputMode === 'chapters'" size="small" text @click="store.enterInputMode()">
                ← 原文模式
              </el-button>
              <el-button v-else size="small" text @click="store.enterChapterMode()">
                章节管理 →
              </el-button>
            </template>
          </div>

          <!-- 输入模式：原始大文本框 -->
          <template v-if="store.inputMode === 'input'">
            <el-input v-model="store.novelText" type="textarea" :rows="22" class="input-area"
              placeholder="在此粘贴小说文本……&#10;&#10;支持格式：&#10;· 章回体：第一章 / 第一回 / Chapter 1&#10;· 中文/英文引号对话&#10;· 自然场景描述"
              @input="onRawInput" />
            <div class="input-footer">
              <div class="chapter-info">
                <span class="info-label">已检测章节数：</span>
                <el-tag :type="store.chapterCount >= 3 ? 'success' : 'danger'" size="small">
                  {{ store.chapterCount }}
                </el-tag>
                <span v-if="store.chapterCount > 0 && store.chapterCount < 3" class="info-warn">
                  至少需要 3 章
                </span>
              </div>
              <el-button v-if="store.chapterCount > 0 && store.chapterCount < 3" size="small" type="warning" plain
                @click="doAutoSplit">
                🔀 自动分割为 3 章
              </el-button>
            </div>
          </template>

          <!-- 章节管理模式：可折叠卡片 -->
          <template v-else>
            <div class="chapter-list">
              <div v-for="(ch, i) in store.chapterTexts" :key="i" class="chapter-card">
                <div class="chapter-header" @click="toggleChapter(i)">
                  <div class="chapter-index">
                    <el-tag size="small"
                      :type="i < 3 ? (i === 0 ? 'danger' : i === 1 ? 'warning' : 'primary') : 'info'">
                      {{ i + 1 }}
                    </el-tag>
                  </div>
                  <el-input :model-value="ch.title" size="small" class="chapter-title-input" placeholder="章节标题"
                    @click.stop @input="(v) => store.updateChapterTitle(i, v)" />
                  <div class="chapter-actions" @click.stop>
                    <el-button size="small" text :disabled="i === 0" @click="store.moveChapter(i, i - 1)">▲</el-button>
                    <el-button size="small" text :disabled="i === store.chapterTexts.length - 1"
                      @click="store.moveChapter(i, i + 1)">▼</el-button>
                    <el-button size="small" text type="danger" @click="store.removeChapter(i)">×</el-button>
                  </div>
                  <el-icon class="collapse-icon" :class="{ rotated: expanded[i] }">
                    <ArrowDown />
                  </el-icon>
                </div>
                <div v-show="expanded[i]" class="chapter-body">
                  <el-input :model-value="ch.content" type="textarea"
                    :rows="Math.max(6, Math.ceil((ch.content?.length || 1) / 80))" class="chapter-content-input"
                    placeholder="章节正文……" @input="(v) => onChapterEdit(i, v)" />
                  <div class="chapter-footer-info">
                    <span>{{ ch.content?.length || 0 }} 字</span>
                    <span v-if="ch.content" style="margin-left:12px;color:var(--color-text-secondary)">
                      最后编辑: {{ editTimestamps[i] || '—' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="chapter-toolbar">
              <el-button size="small" type="primary" plain @click="store.addChapter()">
                ＋ 添加章节
              </el-button>
              <el-button size="small" text @click="store.enterInputMode()">
                重新粘贴原文
              </el-button>
            </div>
          </template>
        </div>
      </div>

      <!-- ===== 右栏 ===== -->
      <div class="col col-output">
        <div class="panel">
          <div class="panel-title">
            <span>🎬 剧本预览</span>
          </div>

          <!-- 工具栏 -->
          <div class="output-toolbar">
            <div class="toolbar-left">
              <el-button type="primary" :loading="store.isConverting" :disabled="store.chapterCount < 3"
                @click="handleConvert">
                🤖 AI 转换
              </el-button>
              <el-button :disabled="store.chapterCount < 3" @click="handleConvertLocal">
                ⚙️ 本地转换
              </el-button>

              <template v-if="store.hasResult">
                <!-- 全局/分章 视图切换 -->
                <el-radio-group v-model="viewMode" size="small">
                  <el-radio-button value="global">📋 全局剧本</el-radio-button>
                  <el-radio-button value="chapter">📄 章节剧本</el-radio-button>
                </el-radio-group>

                <!-- 下载按钮 -->
                <template v-if="viewMode === 'global'">
                  <el-button size="small" :disabled="!store.globalYaml" @click="downloadGlobalYaml">
                    ⬇️ 全局
                  </el-button>
                </template>
                <template v-else>
                  <el-button size="small" :disabled="!store.currentChapterYaml" @click="downloadChapterYaml">
                    ⬇️ 本章
                  </el-button>
                </template>
              </template>
            </div>
            <div class="toolbar-right">
              <el-input v-model="store.apiKey" type="password" size="small" placeholder="API Key" show-password
                clearable style="width:140px" @input="(v) => store.setApiKey(v)" />
              <el-checkbox :model-value="store.rememberKey" size="small" @change="(v) => store.setRememberKey(v)">
                记住
              </el-checkbox>
            </div>
          </div>

          <!-- 转换进度提示 -->
          <div v-if="store.isConverting && store.convertProgress > 0" class="progress-bar">
            <el-progress :percentage="store.convertProgress" :stroke-width="6" :show-text="false" />
            <div class="progress-text">{{ store.currentConvertingChapter }}</div>
          </div>

          <!-- 分章剧本页签导航 -->
          <div v-if="store.hasResult && viewMode === 'chapter' && (store.chapterYamls?.length ?? 0) > 0" class="chapter-tabs">
            <el-tabs v-model="store.activeChapterIndex" type="card" @tab-click="loadYamlForView">
              <el-tab-pane
                v-for="(ch, i) in store.chapterTexts"
                :key="i"
                :label="ch.title || `第${i + 1}章`"
                :name="i"
              />
            </el-tabs>
          </div>

          <!-- 全局角色表 -->
          <div v-if="store.hasResult && store.characters.length > 0" class="char-table-section">
            <div class="char-table-header" @click="charTableExpanded = !charTableExpanded">
              <div class="char-table-title">
                👥 全局角色表
                <el-tag size="small" type="success" effect="plain" style="margin-left:6px">
                  {{ store.characters.length }} 人
                </el-tag>
              </div>
              <div class="char-table-subtitle">各场景引用的角色 ID 全局统一，修改后自动同步</div>
              <el-icon class="collapse-icon" :class="{ rotated: charTableExpanded }">
                <ArrowDown />
              </el-icon>
            </div>
            <div v-show="charTableExpanded" class="char-table-body">
              <el-table :data="localChars" size="small" border stripe max-height="240" style="width:100%">
                <el-table-column type="index" label="#" width="44" align="center" />
                <el-table-column prop="id" label="ID" width="88">
                  <template #default="{ row }">
                    <code class="char-id">{{ row.id }}</code>
                  </template>
                </el-table-column>
                <el-table-column prop="name" label="角色名" width="130">
                  <template #default="{ row }">
                    <el-input v-model="row.name" size="small" @input="debounceSyncChars" />
                  </template>
                </el-table-column>
                <el-table-column prop="description" label="描述">
                  <template #default="{ row }">
                    <el-input v-model="row.description" size="small" placeholder="年龄 / 外貌 / 性格"
                      @input="debounceSyncChars" />
                  </template>
                </el-table-column>
                <el-table-column prop="role" label="定位" width="100">
                  <template #default="{ row }">
                    <el-select v-model="row.role" size="small" @change="syncChars">
                      <el-option label="主角" value="protagonist" />
                      <el-option label="反派" value="antagonist" />
                      <el-option label="配角" value="supporting" />
                      <el-option label="龙套" value="minor" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column prop="arc" label="弧光" width="110">
                  <template #default="{ row }">
                    <el-input v-model="row.arc" size="small" placeholder="成长线" @input="debounceSyncChars" />
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>

          <!-- YAML 编辑区 -->
          <el-input v-model="yamlText" type="textarea" :rows="yamlRows" class="yaml-area"
            :placeholder="yamlPlaceholder" @input="onYamlEdit" />

          <!-- 状态提示 -->
          <div class="output-footer">
            <div v-if="store.isConverting" class="status loading">
              <el-icon class="is-loading" style="margin-right:6px">
                <Loading />
              </el-icon>
              AI 正在转换，请稍候…
            </div>
            <div v-else-if="store.error" class="status error">
              <el-icon style="margin-right:6px;color:var(--el-color-danger)">
                <WarningFilled />
              </el-icon>
              {{ store.error }}
            </div>
            <div v-else-if="store.hasResult" class="status success">
              <el-icon style="margin-right:6px;color:var(--el-color-success)">
                <SuccessFilled />
              </el-icon>
              转换完成 · 全局剧本: {{ store.convertedActCount }} 幕 · 独立章节: {{ store.chapterYamls?.length ?? 0 }} 章
              <span v-if="viewMode === 'chapter' && (store.chapterYamls?.length ?? 0) > 0" class="incremental-hint">
                · 当前: {{ store.chapterTexts[store.activeChapterIndex]?.title || `第${store.activeChapterIndex + 1}章` }}
              </span>
            </div>
            <div v-else class="status idle">
              填写 API Key 后点击 AI 转换，或使用本地规则引擎
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部栏 -->
    <div class="bottom-bar">
      <span class="security-hint">
        🔒 密钥仅保存在浏览器本地，不会上传到任何服务器
      </span>
      <el-button text size="small" @click="store.clearAll()">
        🗑️ 清空所有数据
      </el-button>
      <el-button text size="small" @click="$router.push('/schema')">
        📖 YAML Schema 文档
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, WarningFilled, SuccessFilled, ArrowDown, Tools } from '@element-plus/icons-vue'
import { useNovelStore } from '@/stores/novel'
import { buildYamlOutput } from '@/utils/converter.js'

const router = useRouter()
const store = useNovelStore()

const charTableExpanded = ref(true)
const localChars = ref([])

/* 可编辑的 YAML 文本 */
const yamlText = ref('')

/* 视图模式：global / chapter */
const viewMode = ref('global')

watch(() => store.characters, (chars) => {
  if (chars && chars.length) {
    localChars.value = JSON.parse(JSON.stringify(chars))
  }
}, { immediate: true, deep: true })

/* 切换视图时加载对应的 YAML */
function loadYamlForView() {
  if (!store.hasResult) { yamlText.value = ''; return }
  if (viewMode.value === 'chapter') {
    yamlText.value = store.currentChapterYaml
  } else {
    yamlText.value = store.globalYaml
  }
}

watch(viewMode, () => { loadYamlForView() })

/* 切换章节时更新 YAML 编辑区 */
watch(() => store.activeChapterIndex, () => {
  if (viewMode.value === 'chapter') { loadYamlForView() }
})

/* 编辑后同步回 store */
let editTimer = null
function onYamlEdit(val) {
  clearTimeout(editTimer)
  editTimer = setTimeout(() => {
    if (viewMode.value === 'global') {
      store.globalYaml = val
    }
  }, 500)
}

const yamlPlaceholder = computed(() => {
  if (store.hasResult && viewMode.value === 'chapter' && !store.currentChapterYaml) {
    return '该章节暂无独立剧本'
  }
  return '点击「AI 转换」或「本地转换」生成剧本……'
})

const yamlRows = computed(() => {
  if (store.hasResult && store.characters.length > 0 && charTableExpanded.value) {
    return 14
  }
  return 18
})

const expanded = ref({})
const editTimestamps = ref({})

const inputTitle = computed(() =>
  store.inputMode === 'input' ? '小说原文' : `章节管理（${store.chapterCount} 章）`
)

function onRawInput() {
  store.setNovelText(store.novelText)
}

function toggleChapter(i) {
  expanded.value[i] = !expanded.value[i]
}

function onChapterEdit(index, content) {
  store.updateChapterContent(index, content)
  editTimestamps.value[index] = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function doAutoSplit() {
  store.autoSplitIntoThree()
  if (store.error) {
    ElMessage.warning(store.error)
  } else {
    ElMessage.success('已按段落均分为 3 章')
    store.chapterTexts.forEach((_, i) => { expanded.value[i] = true })
  }
}

watch(() => store.chapterTexts.length, (len) => {
  for (let i = 0; i < len; i++) {
    if (expanded.value[i] === undefined) expanded.value[i] = true
  }
}, { immediate: true })

/* ===== 转换 ===== */
async function handleConvert() {
  if (store.chapterCount < 3) {
    store.error = `当前仅检测到 ${store.chapterCount} 章，至少需要 3 章`
    ElMessage.warning(store.error)
    return
  }
  if (!store.apiKey) {
    ElMessage.warning('请先配置 API Key')
    return
  }
  const success = await store.runAIConversion()
  if (success) {
    ElMessage.success(`转换完成！全局剧本 ${store.convertedActCount} 幕，${store.chapterYamls?.length ?? 0} 章独立剧本`)
    viewMode.value = 'global'
  } else if (store.error) {
    ElMessage.error(store.error)
  }
}

async function handleConvertLocal() {
  if (store.chapterCount < 3) {
    store.error = `当前仅检测到 ${store.chapterCount} 章，至少需要 3 章`
    ElMessage.warning(store.error)
    return
  }
  const success = await store.runLocalConversion()
  if (success) {
    ElMessage.success(`本地转换完成！全局剧本 ${store.convertedActCount} 幕，${store.chapterYamls?.length ?? 0} 章独立剧本`)
    viewMode.value = 'global'
  } else if (store.error) {
    ElMessage.error(store.error)
  }
}

function downloadGlobalYaml() {
  const content = store.globalYaml
  if (!content) return
  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `全局剧本_${store.metadata.title || 'untitled'}.yaml`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('全局剧本下载成功')
}

function downloadChapterYaml() {
  const content = store.currentChapterYaml
  if (!content) return
  const idx = store.activeChapterIndex
  const ch = store.chapterTexts[idx]
  const chTitle = ch?.title || `chapter_${idx + 1}`
  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `章节剧本_${chTitle}_${store.metadata.title || 'untitled'}.yaml`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`「${chTitle}」独立剧本下载成功`)
}

let syncTimer = null
function debounceSyncChars() {
  clearTimeout(syncTimer)
  syncTimer = setTimeout(syncChars, 300)
}

function syncChars() {
  if (!store.screenplay?.screenplay) return
  store.screenplay.screenplay.characters = JSON.parse(JSON.stringify(localChars.value))
  store.globalYaml = buildYamlOutput(store.screenplay)
  store._buildChapterScreenplays()
  store._save()
}

onMounted(() => {
  if (store.hasResult) {
    viewMode.value = 'global'
    loadYamlForView()
  }
})

// 转换完成后自动加载 YAML
watch(() => store.globalYaml, (val) => {
  if (val) { loadYamlForView() }
})
</script>

<style scoped>
.converter {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ===== 两栏 ===== */
.two-column {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 16px 20px 0;
  overflow: hidden;
}

.col {
  flex: 1;
  min-width: 0;
  display: flex;
}

.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 16px;
  min-height: 0;
}

/* ===== 标题 ===== */
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  flex-shrink: 0;
}

/* ===== 输入区 ===== */
.input-area {
  flex: 1;
  min-height: 0;
}

.input-area :deep(.el-textarea__inner) {
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.8;
  height: 100% !important;
  min-height: 0;
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  flex-shrink: 0;
}

.chapter-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.info-label {
  color: var(--color-text-secondary);
}

.info-warn {
  font-size: 12px;
  color: var(--el-color-warning);
}

/* ===== 章节卡片列表 ===== */
.chapter-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  margin-bottom: 8px;
  padding-right: 4px;
}

.chapter-card {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 8px;
  background: #fafbfc;
}

.chapter-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
}

.chapter-header:hover {
  background: #f0f1f3;
  border-radius: 6px 6px 0 0;
}

.chapter-index {
  flex-shrink: 0;
}

.chapter-title-input {
  flex: 1;
  min-width: 0;
}

.chapter-title-input :deep(.el-input__inner) {
  font-size: 13px;
  font-weight: 600;
  border: none;
  background: transparent;
  padding: 0;
  height: 28px;
}

.chapter-title-input :deep(.el-input__inner):focus {
  background: #fff;
  border: 1px solid #409eff;
  border-radius: 4px;
  padding: 0 6px;
}

.chapter-actions {
  display: flex;
  gap: 0;
  flex-shrink: 0;
}

.chapter-actions .el-button {
  font-size: 11px;
  padding: 0 4px;
}

.collapse-icon {
  transition: transform .2s;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

.chapter-body {
  padding: 0 10px 10px;
}

.chapter-content-input :deep(.el-textarea__inner) {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.7;
  min-height: 100px;
}

.chapter-footer-info {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.chapter-toolbar {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ===== 右栏 ===== */
.output-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.progress-bar {
  margin-bottom: 10px;
  flex-shrink: 0;
}

.progress-text {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-top: 4px;
  text-align: center;
}

.yaml-area {
  flex: 1;
  min-height: 0;
}

.yaml-area :deep(.el-textarea__inner) {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
  height: 100% !important;
  min-height: 0;
}

/* ===== 状态 ===== */
.output-footer {
  margin-top: 10px;
  flex-shrink: 0;
}

.status {
  display: flex;
  align-items: center;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 6px;
}

.status.idle {
  color: var(--color-text-secondary);
  background: #f8f9fa;
}

.status.loading {
  color: var(--el-color-primary);
  background: #eff6ff;
}

.status.error {
  color: var(--el-color-danger);
  background: #fef2f2;
}

.status.success {
  color: var(--el-color-success);
  background: #f0fdf4;
  flex-wrap: wrap;
}

.incremental-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-color-info);
}

/* ===== 全局角色表 ===== */
.char-table-section {
  flex-shrink: 0;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  margin-bottom: 8px;
  background: #fafbfc;
}

.char-table-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
}

.char-table-header:hover {
  background: #f0f1f3;
  border-radius: 6px;
}

.char-table-title {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
}

.char-table-subtitle {
  font-size: 11px;
  color: var(--color-text-secondary);
  flex: 1;
}

.char-table-body {
  padding: 0 10px 8px;
}

.char-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #7c3aed;
  background: #f3f0ff;
  padding: 1px 5px;
  border-radius: 3px;
}

/* ===== 配置行 ===== */
.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-hint {
  font-size: 11px;
  color: var(--color-text-secondary);
  line-height: 1.4;
}

/* ===== 底部栏 ===== */
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  font-size: 12px;
}

.security-hint {
  color: var(--color-text-secondary);
}

/* ===== 分章页签 ===== */
.chapter-tabs {
  flex-shrink: 0;
}

.chapter-tabs :deep(.el-tabs__item) {
  font-size: 12px;
  padding: 0 12px;
  height: 30px;
  line-height: 30px;
}

.chapter-tabs :deep(.el-tabs__nav) {
  border: none;
}

/* ===== 滚动条 ===== */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d0d5dd;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>