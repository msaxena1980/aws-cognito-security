<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div id="app">
    <nav class="nav">
      <div class="nav-inner">
        <RouterLink to="/" class="nav-link">Home</RouterLink>
        <RouterLink to="/about" class="nav-link">About</RouterLink>
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
}

.nav-link:hover {
  color: var(--vt-c-green-1);
  background-color: var(--vt-c-green-2);
}

.nav-link.router-link-active {
  color: var(--vt-c-green-1);
  background-color: var(--vt-c-green-2);
}

.main {
  flex: 1;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem;
}
</style>
