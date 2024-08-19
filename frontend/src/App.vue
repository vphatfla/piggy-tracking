<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <Header></Header>
  <main class="main-content mt-5 mb-5 h-100">
    <RouterView />
  </main>
  <!-- <Footer></Footer> -->
</template>

<script lang="ts">
import Header from './components/Header.vue'
import Footer from './components/Footer.vue'
export default {
  name: 'App',
  components: {
    Header,
    Footer
  }
}
</script>

<style>
#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh; /* Ensure the container takes up at least the full viewport height */
}

/* Add styles to ensure header and footer have consistent height */
header,
footer {
  position: fixed;
  width: 100%;
  left: 0;
  z-index: 1000; /* Keep it above other content */
}

header {
  top: 0;
  height: 3rem; /* Example height for header */
}

footer {
  bottom: 0;
  height: 3rem; /* Example height for footer */
}
</style>
