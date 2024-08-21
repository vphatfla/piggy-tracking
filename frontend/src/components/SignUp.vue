<template>
  <div class="row align-items-center">
    <div>
        <div class="text-left">
      <h4>Register Your New Account</h4>
    </div>
    <div class="text-left" style="max-width: 500px;">
      <form @submit.prevent="signUp" oninput='confirmPassword.setCustomValidity(confirmPassword.value != password.value ? "Passwords do not match." : "")'>
        <div class="mb-3">
          <label for="exampleInputEmail1" class="form-label">Email</label>
          <input type="email" class="form-control" id="exampleInputEmail1" aria-describedby="emailHelp" v-model="email" required>
          <div id="emailHelp" class="form-text">We'll never share your email with anyone else.</div>
        </div>
        <div class="mb-3">
          <label class="form-label">Name</label>
          <input type="string" class="form-control" v-model="name" required>        
        </div>
        <div class="mb-3">
          <label for="exampleInputPassword1" class="form-label">Password</label>
          <input type="password" class="form-control" id="exampleInputPassword1" v-model="password" name="password" required>
        </div>
        <div class="mb-3">
          <label for="exampleInputPassword1" class="form-label">Confirm Password</label>
          <input type="password" class="form-control" id="exampleInputPassword1" name="confirmPassword" required>
        </div>
        <div class="mb-3">
          <label for="exampleInputPassword1" class="form-label">Code</label>
          <input type="number" class="form-control" v-model="code" required>
        </div>
        <div class="d-flex">
          <div class="mr-auto pr-2 pt-2 pb-2">
            <button type="submit" class="btn btn-primary" :disabled="isFetching">Submit</button>
          </div>
        </div>
      </form>
    </div>
    </div>
  </div>
</template>

<script lang="ts">
import { signUpFunction } from '../auth/authService'
import { useRouter } from 'vue-router';
export default {
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'SignUp',
  data() {
    return {
      isFetching: false,
      email: '',
      name: '',
      password: '',
      code: 0,
      router: useRouter()
    }
  },
  methods: {
    async signUp() {
      this.isFetching = true
      console.log('sing up handler')
      const res = await signUpFunction(this.email, this.name, this.password, this.code)
      if (res === null) {
        this.isFetching = false
        console.log('sign up successed')
        this.$emit('updateSignUpStatus')
      } else {
        console.log(res)
      }
    }
  }
}
</script>
