<template>
  <header class="header">
    <div class="container">
      <div class="d-flex">
        <img src="../../static/pig-logo.png"  style="width: 2rem; margin-right: 2rem;">
        <h1 class="logo mb-0">Piggy Tracking</h1>
      </div>
      <nav class="nav">
        <ul>
          <li><router-link to="/">Home</router-link></li>
          <li><router-link to="/contact">Contact</router-link></li>
           <!-- <li> <github-button
            href="https://github.com/vphatfla"
            data-color-scheme="no-preference: light; light: light; dark: dark;"
            data-size="large"
            aria-label="Follow @buttons on GitHub"
            >Follow @vphatfla</github-button> </li> -->
        </ul>
      </nav>
    </div>
  </header>
</template>

<script>
import GithubButton from 'vue-github-button'
export default {
  // eslint-disable-next-line vue/multi-word-component-names, vue/no-reserved-component-names
  name: 'Header',
  // eslint-disable-next-line vue/no-unused-components
  components: {GithubButton}
}
</script>

<style scoped>
.header {
  background-color: #cdcdcd2e;
  color: #000000;
  padding: 1rem;
  position: fixed;
  display: flex;
  align-items: center;
}

.container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
}

.logo {
  font-size: 1.5rem;
}

.nav ul {
  list-style: none;
  display: flex;
  gap: 1rem;
  margin-bottom: 0 !important;
}

.nav a {
  color: #000000;
  text-decoration: none;
}

.nav a:hover {
  text-decoration: underline;
}
</style>
