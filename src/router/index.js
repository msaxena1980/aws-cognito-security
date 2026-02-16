import { createRouter, createWebHistory } from 'vue-router'
import { authState, checkAuth } from '../services/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { title: 'Home' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: 'Login' },
    },
    {
      path: '/signup',
      name: 'signup',
      component: () => import('../views/SignupView.vue'),
      meta: { title: 'Signup' },
    },
    {
      path: '/confirm-signup',
      name: 'confirm-signup',
      component: () => import('../views/ConfirmSignupView.vue'),
      meta: { title: 'Confirm Account' },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('../views/ForgotPasswordView.vue'),
      meta: { title: 'Forgot Password' },
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('../views/ResetPasswordView.vue'),
      meta: { title: 'Reset Password' },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { title: 'Admin', requiresAuth: true },
    },
    {
      path: '/passkey',
      name: 'passkey',
      component: () => import('../views/PasskeyView.vue'),
      meta: { title: 'Passkeys', requiresAuth: true },
    },
  ],
})

router.beforeEach(async (to, from, next) => {
  document.title = to.meta.title ? `${to.meta.title} | AWS Security` : 'AWS Security'

  if (authState.loading) {
    await checkAuth()
  }

  if (to.meta.requiresAuth && !authState.isAuthenticated) {
    next({ name: 'login', query: { redirect: to.fullPath } })
  } else {
    next()
  }
})

export default router
