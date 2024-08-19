<template>
  <div class="hello">
    <DataTable
      :value="transactionsArr"
      paginator
      :rows="10"
      :rowsPerPageOptions="[10, 20, 50]"
      tableStyle="min-width: 50rem"
      paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
      currentPageReportTemplate="{first} to {last} of {totalRecords}"
    >
      <Column field="item_name" sortable header="Item Name" style="width: 20%"></Column>
      <Column field="type" sortable header="Type" style="width: 20%"></Column>
      <Column field="amount" header="Amount" sortable style="width: 20%"></Column>
      <Column field="comment" header="Comment" sortable style="width: 20%"></Column>
      <Column field="date" header="Date Purchased" sortable style="width: 20%">
        <template #body="{ data }">
          {{ convertDate(data.date) }}
        </template></Column
      >
    </DataTable>
  </div>
</template>

<script>
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { getTransactionsByUserId } from '../util/transactionsUtil.js'
import { getAccountDetails } from '../util/accountUtil.js'
import { useRouter, useRoute } from 'vue-router'

// Options for formatting
const options = {
  weekday: 'long', // "Thursday"
  day: '2-digit', // "20"
  month: '2-digit', // "07"
  year: 'numeric' // "2024"
}

export default {
  name: 'TableData',
  components: {
    DataTable,
    Column
  },
  props: ['transactionsArr'],
  data() {
    return {}
  },
  methods: {
    convertDate(dateTimeStr) {
      const date = new Date(dateTimeStr)
      return (date.getUTCMonth() + 1) + '-'+ (date.getUTCDate()) + '-' +date.getUTCFullYear() 
    }
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
</style>
