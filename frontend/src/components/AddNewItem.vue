<template>
  <form class="row row-cols-lg-auto align-items-center" @submit.prevent="submitTransaction">
    <div class="col mb-3">
      <input type="text" class="form-control" placeholder="Item Name" aria-label="Item Name" v-model="item_name" required>
    </div>
    <div class="col mb-3">
      <input type="text" class="form-control" placeholder="Type" aria-label="Type" v-model="type" required>
    </div>
    <div class="col mb-3">
      <input type="number" class="form-control" placeholder="Amount" aria-label="Amount" v-model="amount" required>
    </div>
    <div class="col mb-3">
      <input type="text" class="form-control" placeholder="Comment" aria-label="Comment" v-model="comment" required>
    </div>
    <div class="col mb-3">
      <input type="date" class="form-control datepicker" placeholder="Date Purchased" aria-label="Date Purchased"
        v-model="date" required>
    </div>
    <div class="col mb-3">
      <button type="submit" class="btn btn-outline-secondary">Add</button>
    </div>
  </form>
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
    resetData() {
      this.item_name = ''
      this.type = ''
      this.amount = ''
      this.comment = ''
      this.date = ''
    },
    async submitTransaction() {
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
      this.resetData()
      this.$emit('parentFetch')
    }
  }
}
</script>
