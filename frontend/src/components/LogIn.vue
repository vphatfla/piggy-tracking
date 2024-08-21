<template>
  <div class="row align-items-center">
    <div>
        <div class="text-left">
      <h4>Login To Your Account</h4>
    </div>
    <div class="text-left" style="max-width: 500px;">
      <form @submit.prevent="login">
        <div class="mb-3">
          <label for="exampleInputEmail1" class="form-label">Email</label>
          <input type="email" class="form-control" id="exampleInputEmail1" aria-describedby="emailHelp" v-model="email">
          <!-- <div id="emailHelp" class="form-text">We'll never share your email with anyone else.</div> -->
        </div>
        <div class="mb-3">
          <label for="exampleInputPassword1" class="form-label">Password</label>
          <input type="password" class="form-control" id="exampleInputPassword1" v-model="password">
        </div>
        <div class="d-flex">
          <div class="mr-auto pr-2 pt-2 pb-2">
            <button type="submit" class="btn btn-primary">Submit</button>
          </div>
        </div>
      </form>
    </div>
    </div>
  </div>
</template>

<script lang="ts">
import { loginFunction } from '../auth/authService'
import { useRouter } from 'vue-router';
export default {
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'LogIn',
  data() {
    return {
      email: '',
      password: '',
      router: useRouter()
    }
  },
  methods: {
    async login() {
      console.log('Login Handler')
      const res = await loginFunction(this.email, this.password)
      if (res === null) {
        console.log('log in successed')
        const user_id = localStorage.getItem('user_id') || ''
        console.log('user id = ', +user_id)
        this.router.push({ path: '/transactions', query: { userId: user_id } })
      } else {
        console.log(res)
      }
    }
  }
}
</script>
