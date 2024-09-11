<template>
    <Bar id="my-chart-id" :options="getChartOptions" :data="getChartData" />
</template>

<script>
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, Colors } from 'chart.js'
import { toRef } from "vue"
ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, Colors)

export default {
    name: 'GraphData',
    components: { Bar },
    props: ['transactionsArr'],
    data() {
        return {
            chartData: {
                labels: [],
                datasets: [
                    {
                        data: [],
                        label: "Spent Anmount",
                        color: '#f87979'
                    }
                ]
            },
            chartOptions: {
                responsive: true
            },
            labelList: [],
            dataSetList: [],
        }
    },
    methods: {
        filterData(transactionsArr) {
            const map = {};
            transactionsArr.forEach(el => {
                const type = el.type;
                if (type in map) {
                    map[type] += el.amount;
                } else {
                    map[type] = el.amount;
                }
            })
            const keyList = []
            const dataList = []
            Object.keys(map).forEach(el => {
                keyList.push(el);
                dataList.push(map[el]);
            })
            this.labelList = keyList
            this.dataSetList = dataList
        }
    },
    computed: {
        getChartData() {
            return {
                labels: [...this.labelList],
                datasets: [
                    {
                        data: [...this.dataSetList],
                        label: this.chartData.datasets[0].label,
                        color: this.chartData.datasets[0].color
                    }
                ]
            }
        },
        getChartOptions() {
            return { ...this.chartOptions }
        },
    },
    mounted() {
        this.filterData(this.transactionsArr)
    }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped></style>
