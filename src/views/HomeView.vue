<script setup>
import HelloWorld from '../components/HelloWorld.vue'
</script>

<template>
  <div class="home">
    <header class="home-header">
      <div class="wrapper">
        <HelloWorld msg="AWS cognito demo" />
      </div>
    </header>

  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.home-header {
  line-height: 1.5;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

@media (min-width: 1024px) {
  .home {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: calc(var(--section-gap) / 2);
    align-items: start;
  }

  .home-header {
    display: flex;
    place-items: center;
    padding-right: 1rem;
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  .home-header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
