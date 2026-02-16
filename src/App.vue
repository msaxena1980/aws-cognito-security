<script setup>
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { authState, handleSignOut } from './services/auth'

const router = useRouter()

async function logout() {
  await handleSignOut()
  router.push('/')
}
</script>

<template>
  <div id="app">
    <nav class="nav">
      <div class="nav-inner">
        <div class="nav-left">
          <RouterLink to="/" class="nav-link">Home</RouterLink>
          <RouterLink to="/admin" class="nav-link">Admin</RouterLink>
        </div>
        <div class="nav-right">
          <template v-if="!authState.isAuthenticated">
            <RouterLink to="/login" class="nav-link">Login</RouterLink>
            <RouterLink to="/signup" class="nav-link btn-signup">Signup</RouterLink>
          </template>
          <template v-else>
            <span class="user-email">{{ authState.user?.signInDetails?.loginId || 'User' }}</span>
            <button @click="logout" class="nav-link btn-logout">Logout</button>
          </template>
        </div>
      </div>
    </nav>

    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.nav {
  background: var(--color-background-soft);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.nav-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-left, .nav-right {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}

.nav-link {
  color: var(--color-text);
  text-decoration: none;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: color 0.2s, background-color 0.2s;
  cursor: pointer;
  background: none;
  border: none;
  font-size: inherit;
}

.nav-link:hover {
  color: var(--vt-c-green-1);
  background-color: var(--vt-c-green-2);
}

.nav-link.router-link-active {
  color: var(--vt-c-green-1);
  background-color: var(--vt-c-green-2);
}

.btn-signup {
  background-color: var(--vt-c-green-1);
  color: white;
  padding: 0.5rem 1rem;
}

.btn-signup:hover {
  background-color: #3ca374;
  color: white;
}

.btn-logout {
  color: #ff4d4f;
}

.btn-logout:hover {
  background-color: #fff1f0;
  color: #ff4d4f;
}

.user-email {
  font-size: 0.875rem;
  color: var(--color-text-light);
}

.main {
  flex: 1;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem;
}
</style>
