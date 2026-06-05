<template>
  <div class="converter">
    <div class="two-column">
      <!-- ===== 左栏：输入区 ===== -->
      <div class="col col-input">
        <div class="panel">
          <div class="panel-title">
            <span>📄 小说原文</span>
            <el-tag size="small" type="warning" effect="plain">需 ≥ 3 章</el-tag>
          </div>

          <el-input v-model="store.novelText" type="textarea" :rows="22" class="input-area"
            placeholder="在此粘贴小说文本……&#10;&#10;支持格式：&#10;· 章回体：第一章 / 第一回 / Chapter 1&#10;· 中文/英文引号对话&#10;· 自然场景描述"
            @input="onInput" />

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
        </div>
      </div>

      <!-- ===== 右栏：输出区 ===== -->
      <div class="col col-output">
        <div class="panel">
          <div class="panel-title">
            <span>🎬 剧本预览</span>
            <el-tag size="small" type="primary" effect="plain">YAML 格式</el-tag>
          </div>

          <!-- 工具栏 -->
          <div class="output-toolbar">
            <div class="toolbar-left">
              <el-button type="primary" :loading="store.isConverting" :disabled="store.chapterCount < 3" size="default"
                @click="startAIConvert">
                {{ store.isConverting ? '转换中...' : '🤖 AI 转换' }}
              </el-button>
              <el-button size="default" :disabled="!store.yamlOutput" @click="downloadYaml">
                ⬇️ 下载 YAML
              </el-button>
            </div>
            <div class="toolbar-right">
              <el-input v-model="store.apiKey" type="password" size="small" placeholder="OpenAI API Key" show-password
                clearable style="width:200px" @input="onApiKeyChange" />
              <el-checkbox v-model="store.rememberKey" size="small" @change="onRememberChange">
                记住密钥
              </el-checkbox>
              <el-select v-model="store.model" size="small" style="width:140px" @change="onModelChange">
                <el-option label="GPT-3.5-turbo" value="gpt-3.5-turbo" />
                <el-option label="GPT-4-turbo" value="gpt-4-turbo" />
              </el-select>
            </div>
          </div>

          <!-- YAML 编辑区 -->
          <el-input v-model="yamlText" type="textarea" :rows="18" class="yaml-area"
            placeholder="点击「AI 转换」生成剧本……&#10;&#10;你也可以直接在此编辑 YAML 内容" @input="onYamlEdit" />

          <!-- 状态提示区 -->
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
              转换完成
            </div>
            <div v-else class="status idle">
              填写 API Key 后点击「AI 转换」
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

    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Loading, WarningFilled, SuccessFilled } from '@element-plus/icons-vue'
import { useNovelStore } from '@/stores/novel'
import { convertWithAI } from '@/api/converter.js'

const router = useRouter()
const store = useNovelStore()

// 本地 YAML 文本（可编辑，与 store 同步）
const yamlText = ref('')
watch(() => store.yamlOutput, (v) => {
  if (v) yamlText.value = v
})

function onInput() {
  store.setNovelText(store.novelText)
}

function onYamlEdit(val) {
  // 用户手动编辑时不自动回写 store，但保留本地
}

function doAutoSplit() {
  store.autoSplitIntoThree()
  if (store.error) {
    ElMessage.warning(store.error)
  } else {
    ElMessage.success('已按段落均分为 3 章，可继续编辑')
  }
}

function onApiKeyChange(val) {
  store.setApiKey(val)
}

function onModelChange(val) {
  store.setModel(val)
}

function onRememberChange(val) {
  store.setRememberKey(val)
}

async function startAIConvert() {
  if (store.chapterCount < 3) {
    store.error = `当前仅检测到 ${store.chapterCount} 章，至少需要 3 章`
    return
  }
  if (!store.apiKey) {
    store.error = '请填写 OpenAI API Key'
    return
  }

  store.isConverting = true
  store.error = null

  const result = await convertWithAI(store.novelText, {
    apiKey: store.apiKey,
    model: store.model,
    metadata: {
      title: store.metadata.title,
      author: store.metadata.author,
      source: store.metadata.source,
    },
  })

  store.isConverting = false

  if (result.success) {
    store.setYamlOutput(result.yaml)
    yamlText.value = result.yaml
    ElMessage.success('AI 转换完成！')
  } else {
    store.error = result.error
    ElMessage.error(result.error)
  }
}

function downloadYaml() {
  const content = yamlText.value
  if (!content) return
  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `剧本.yaml`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style scoped>
.converter {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ===== 两栏布局 ===== */
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

/* ===== 左栏 ===== */
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  flex-shrink: 0;
}

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

/* ===== 右栏 ===== */
.output-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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

/* ===== 状态区 ===== */
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

/* ===== 滚动条 ===== */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
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
