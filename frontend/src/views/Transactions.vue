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
        <form v-if="openEdit" @submit.prevent="updateDateRange" class="d-flex gap-3 align-items-end flex-grow">
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
            <button class="btn btn-secondary" style="width: fit-content"
              @click.prevent="this.showAddNewItem = !this.showAddNewItem">
              Add New Item
            </button>
          </div>
          <div v-if="showAddNewItem" class="d-flex justify-content-center mt-2">
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
import { formatDateString, formatMonthString } from "../util/dateTimeUtil.js"
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
      user_id: '',
      startDate: null,
      endDate: Date.now(),
    }
  },
  computed: {
    computeDisplayDateInfo() {
      if (this.startDate == null) {
        return formatMonthString(Date.now())
      } else {
        const startD = new Date(new Date(this.startDate))
        const endD = new Date(this.endDate);
        return `${formatDateString(startD)} to ${formatDateString(endD)}`
      }
    }
  },
  methods: {
    addedItemTrigger() {
      this.showAddNewItem = false
      this.fetchTransactions()
    },
    async fetchTransactions() {
      if (this.startDate == null)
        this.fetchCureentMonthTransactions()
      else {
        const start = new Date(new Date(this.startDate).setUTCHours(0, 0, 0, 0)).toISOString()
        const end = new Date(new Date(this.endDate).setUTCHours(0, 0, 0, 0)).toISOString()
        await this.fetchTransactionsWithDateRange(start, end)
      }
    },
    async fetchCureentMonthTransactions() {
      const date = new Date();
      const startStr = new Date(new Date(date.getFullYear(), date.getMonth(), 1).setUTCHours(0, 0, 0, 0)).toISOString();
      const endStr = new Date(new Date(date.getFullYear(), date.getMonth() + 1, 0).setUTCHours(0, 0, 0, 0)).toISOString();
      await this.fetchTransactionsWithDateRange(startStr, endStr)
    },
    async fetchTransactionsWithDateRange(startISOString, endISOString) {

      const res = await getTransactionsByUserIdWithTimeRange(this.user_id, startISOString, endISOString)
      this.transactionsArr = res
    },
    /* eslint-disable @typescript-eslint/no-explicit-any */
    async fetchUserInformation() {
      const res = await getAccountDetails(this.user_id)
      this.u_name = res.name
    },
    updateDateRange() {
      this.fetchTransactions()
    }
  },
  mounted() {
    const route = useRoute()
    this.user_id = localStorage.getItem('user_id') || route.query.user_id
    const date = new Date()
    this.selectMonth = date.getMonth() + 1
    this.selectYear = date.getFullYear()
    this.fetchTransactions()
    this.fetchUserInformation()
  }
}
</script>

<style scoped></style>