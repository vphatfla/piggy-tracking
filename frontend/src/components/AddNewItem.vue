<template>
  <div class="form row w-100 d-flex justify-content-center">
    <div class="row form-group col-md-2">
      <label>Item Name</label>
      <input type="text" v-model="item_name" required />
    </div>
    <div class="row form-group col-md-2">
      <label>Type</label>
      <input type="text" v-model="type" />
    </div>
    <div class="row form-group col-md-2">
      <label>Amount</label>
      <input type="number" v-model="amount" />
    </div>
    <div class="row form-group col-md-2">
      <label>Comment</label>
      <input type="text" v-model="comment" />
    </div>
    <div class="row form-group col-md-2">
      <label>Date</label>
      <input type="date" v-model="date" />
    </div>
    <div class="row form-group col-md-2 d-flex align-items-center">
      <button
        type="button"
        class="btn btn-primary mt-3"
        @click="submitForm"
        style="width: 100px; height: 40px"
        :disabled="uploading"
      >
        Submit
      </button>
    </div>
  </div>
</template>

<script>
import { uploadTransactionFunction } from '../util/transactionsUtil.js'
export default {
  name: 'AddNewItem',
  data() {
    return {
      item_name: '',
      type: '',
      amount: '',
      comment: '',
      date: '',
      uploading: false
    }
  },
  methods: {
    async submitForm() {
      // console.log(new Date(this.date).toISOString())
      this.uploading = true
      const newTransaction = {
        user_id: localStorage.getItem('user_id') - '0',
        item_name: this.item_name,
        type: this.type,
        amount: parseFloat(this.amount),
        comment: this.comment,
        date: new Date(this.date).toISOString()
      }
      const res = await uploadTransactionFunction(newTransaction)
      this.uploading = false
      this.showForm = false
      this.$emit('parentFetch')
    }
  }
}
</script>
