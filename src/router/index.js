import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/converter',
  },
  {
    path: '/converter',
    name: 'Converter',
    component: () => import('@/views/Converter.vue'),
  },
  {
    path: '/schema',
    name: 'SchemaDoc',
    component: () => import('@/views/SchemaDoc.vue'),
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
