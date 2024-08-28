<template>
  <div class="h-100 row">
    <div class="col-md-12 mt-4 d-flex justify-content-center">
      <div class="col-10 p-5">
        <h4>Hello, {{ this.u_name }}</h4>
        <div class="d-flex gap-3">
          <h5>Your Spending in {{ computeDisplayDateInfo }} </h5>
          <a href="#" @click.prevent="openEdit = !openEdit">
            <img src="../assets/pen.svg">
          </a>
        </div>
        <form v-if="openEdit" class="d-flex gap-3 align-items-end flex-grow">
          <div class="form-group">
            <label for="startDate">Start Date:</label>
            <input type="date" class="form-control datepicker" id="startDate" placeholder="Select start date"
              v-model="startDate">
          </div>
          <div class="form-group">
            <label for="endDate">End Date:</label>
            <input type="date" class="form-control datepicker" id="endDate" placeholder="Select end date"
              v-model="endDate">
          </div>
          <button type="submit" class="btn btn-outline-secondary" style="height: 2.5rem;">Apply</button>
        </form>

        <div class="mb-4"></div>
        <div class="card p-4">
          <TableData :transactionsArr="transactionsArr"></TableData>
          <div class="d-flex justify-content-center mt-4">
            <button class="btn btn-primary" style="width: fit-content"
              @click="this.showAddNewItem = !this.showAddNewItem">
              Add New Item
            </button>
          </div>
          <div v-show="showAddNewItem" class="d-flex justify-content-center mt-2">
            <AddNewItem @parentFetch="addedItemTrigger"></AddNewItem>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import TableData from '../components/TableData.vue'
import { getTransactionsByUserId, getTransactionsByUserIdWithTimeRange } from '../util/transactionsUtil.js'
import { getAccountDetails } from '../util/accountUtil.js'
import { useRouter, useRoute } from 'vue-router'
import AddNewItem from '../components/AddNewItem.vue'
export default {
  // eslint-disable-next-line vue/multi-word-component-names
  name: 'Transactions',
  components: { TableData, AddNewItem },
  data() {
    return {
      transactionsArr: [],
      u_name: '',
      showAddNewItem: false,
      openEdit: false,
      selectMonth: '',
      selectYear: '',
      user_id: '',
      startDate: null,
      endDate: null,
    }
  },
  computed: {
    computeDisplayDateInfo() {
      if (this.startDate == null && this.endDate == null) {
        return this.selectMonth + '-' + this.selectYear
      } else {
        const startD = new Date(this.startDate)
        const endD = (this.endDate == null) ? new Date(Date.now()) : new Date(this.endDate);
        return startD.toString() + ' to ' + endD.toString()
      }
    }
  },
  methods: {
    addedItemTrigger() {
      this.showAddNewItem = false
      this.fetchTransactionsWithDateRange()
    },
    async fetchTransactions() {
      const res = await getTransactionsByUserId(this.user_id)
      this.fetchUserInformation()
      this.transactionsArr = res
    },
    async fetchTransactionsWithDateRange() {
      const date = new Date(new Date());
      const firstDate = new Date(new Date(date.getFullYear(), date.getMonth(), 1).setUTCHours(0, 0, 0, 0)).toISOString();
      const lastDate = new Date(new Date(date.getFullYear(), date.getMonth() + 1, 0).setUTCHours(0, 0, 0, 0)).toISOString();
      const res = await getTransactionsByUserIdWithTimeRange(this.user_id, firstDate, lastDate)
      this.transactionsArr = res
    },
    /* eslint-disable @typescript-eslint/no-explicit-any */
    async fetchUserInformation() {
      const res = await getAccountDetails(this.user_id)
      this.u_name = res.name
    }
  },
  mounted() {
    const route = useRoute()
    this.user_id = localStorage.getItem('user_id') || route.query.user_id
    const date = new Date()
    this.selectMonth = date.getMonth() + 1
    this.selectYear = date.getFullYear()
    this.fetchTransactionsWithDateRange()
    this.fetchUserInformation()
    // this.fetchTransactions()
  }
}
</script>

<style scoped></style>