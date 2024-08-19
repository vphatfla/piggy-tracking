<template>
  <footer class="footer">
    <div class="container">
      <p>&copy; 2024 Van Phat Phan. All rights reserved.</p>
      <nav class="nav">
        <ul>
          <github-button
            href="https://github.com/vphatfla"
            data-color-scheme="no-preference: light; light: light; dark: dark;"
            data-size="large"
            aria-label="Follow @buttons on GitHub"
            >Follow @vphatfla</github-button
          >
          <li><router-link to="/privacy">Privacy Policy</router-link></li>
          <li><router-link to="/terms">Terms of Service</router-link></li>
        </ul>
      </nav>
    </div>
  </footer>
</template>

<script lang="ts">
import GithubButton from 'vue-github-button'
export default {
  name: 'Footer',
  components: { GithubButton }
}
</script>

<style scoped>
.footer {
  background-color: #333;
  color: #fff;
  padding: 1rem 0;
  position: fixed;
  width: 100%;
  bottom: 0;
  left: 0;
}

.container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.nav ul {
  list-style: none;
  display: flex;
  gap: 1rem;
}

.nav a {
  color: #fff;
  text-decoration: none;
}

.nav a:hover {
  text-decoration: underline;
}
</style>
