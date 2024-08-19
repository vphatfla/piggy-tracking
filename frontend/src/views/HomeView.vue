<template>
  <div class="col-12 h-100 d-flex justify-content-center">
    <div class="row col-12 d-flex justify-content-center">
      <!-- Your page content goes here -->
      <div class="col col-md-7 d-flex justify-content-center align-items-center">
        <h1>Track Your Spending with Piggy</h1>
      </div>
      <div class="col col-md-5 my-auto ">
        <LogIn  v-if="isToLogInChosen" ></LogIn>
        <SignUp v-else></SignUp>
        <a href="#" @click.prevent="isToLogInChosen = !isToLogInChosen">Don't have an account? Sign Up!</a>
      </div>
    </div>
  </div>
</template>

<script>
import LogIn from '../components/LogIn.vue'
import SignUp from '../components/SignUp.vue'
export default {
  components: {
    LogIn,
    SignUp
  },
  data() {
    return {
      isToLogInChosen: true
    }
  }
}
</script>
