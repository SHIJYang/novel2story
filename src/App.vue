<template>
  <div id="app-root">
    <!-- 顶部栏 -->
    <header class="app-header">
      <div class="header-inner">
        <div class="header-left">
          <span class="logo">🎬</span>
          <div class="header-text">
            <h1 class="app-title">AI 小说转剧本工具</h1>
          </div>
        </div>
        <div class="header-right">
          <el-button :class="{ 'nav-active': $route.path === '/converter' }" size="small" text
            @click="$router.push('/converter')">
            🔄 转换
          </el-button>
          <el-button :class="{ 'nav-active': $route.path === '/schema' }" size="small" text
            @click="$router.push('/schema')">
            📖 Schema 文档
          </el-button>
        </div>
      </div>
    </header>

    <!-- 主内容 -->
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { useRouter, useRoute } from 'vue-router'

const $router = useRouter()
const $route = useRoute()
</script>

<style>
/* Reset */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0
}

:root {
  --color-bg: #f5f6f8;
  --color-surface: #fff;
  --color-border: #e2e6ea;
  --color-text: #1d1d1f;
  --color-text-secondary: #6b7280;
  --font-mono: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  --header-h: 64px
}

html,
body,
#app {
  height: 100%
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: var(--color-bg);
  color: var(--color-text)
}

#app-root {
  height: 100%;
  display: flex;
  flex-direction: column
}

/* Header */
.app-header {
  height: var(--header-h);
  flex-shrink: 0;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04)
}

.header-inner {
  max-width: 1440px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px
}

.logo {
  font-size: 28px
}

.header-text {
  display: flex;
  flex-direction: column
}

.app-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
  line-height: 1.3
}

.app-subtitle {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.4
}

.header-right {
  display: flex;
  gap: 4px
}

.header-right .el-button--small {
  font-size: 13px
}

.nav-active {
  color: #2563eb !important;
  font-weight: 600
}

/* Main */
.app-main {
  flex: 1;
  overflow: hidden;
  padding: 0
}

/* Override Element Plus blue */
.el-button--primary {
  --el-button-bg-color: #2563eb;
  --el-button-border-color: #2563eb;
  --el-button-hover-bg-color: #3b82f6;
  --el-button-hover-border-color: #3b82f6
}
</style>
