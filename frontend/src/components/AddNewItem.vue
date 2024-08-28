<template>
  <form class="d-flex align-items-end gap-1" @submit.prevent="submitTransaction">
    <div class="form-group">
      <label>Item Name</label>
      <input type="text" v-model="item_name" required />
    </div>
    <div class="form-group">
      <label>Type</label>
      <input type="text" v-model="type" />
    </div>
    <div class="form-group">
      <label>Amount</label>
      <input type="number" v-model="amount" />
    </div>
    <div class="form-group">
      <label>Comment</label>
      <input type="text" v-model="comment" />
    </div>
    <div class="form-group">
      <label>Date</label>
      <input type="date" class="form-control datepicker" placeholder="Input Date" v-model="date" />
    </div>
    <button type="submit" class="btn btn-outline-secondary" style="height: 2.5rem;">Add</button>
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
      this.resetData()
      this.$emit('parentFetch')
    }
  }
}
</script>
