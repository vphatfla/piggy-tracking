<template>
  <div class="col-12 h-100 d-flex justify-content-center">
    <div class="row col-12 d-flex justify-content-center">
      <!-- Your page content goes here -->
      <div class="col col-md-7 d-flex justify-content-center align-items-center">
        <h1>Track Your Spending with Piggy</h1>
      </div>
      <div class="col col-md-5 my-auto ">
        <h4 v-show="signUpSucess">Sign Up Successfully, please log in!</h4>
        <LogIn v-if="isToLogInChosen"></LogIn>
        <SignUp v-else @updateSignUpStatus="{ signUpSucess = true; isToLogInChosen = true }"></SignUp>
        <a v-if="isToLogInChosen" href="#" @click.prevent="isToLogInChosen = !isToLogInChosen">Don't have an account? Sign
          Up!</a>
        <a v-else href="#" @click.prevent="isToLogInChosen = !isToLogInChosen">Already have an account? Log In!</a>
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
      isToLogInChosen: true,
      signUpSucess: false
    }
  }
}
</script>
