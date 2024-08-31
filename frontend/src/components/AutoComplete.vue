<template>
    <div class="autocomplete">
        <input type="text" class="form-control" @input="onChange" v-model="search" @keydown.down="onArrowDown"
            @keydown.up="onArrowUp" @keydown.enter="onEnter" placeholder="Item Type" />
        <ul id="autocomplete-results" v-show="isOpen" class="autocomplete-results">
            <li v-for="(result, i) in results" :key="i" @click="setResult(result)" class="autocomplete-result"
                :class="{ 'is-active': i === arrowCounter }">
                {{ result }}
            </li>
        </ul>
    </div>
</template>

<script>
export default {
    name: 'AutoComplete',
    props: {
        itemType: {
            type: String,
            required: true
        },
        items: {
            type: Array,
            required: false,
            default: () => [],
        },
        isAsync: {
            type: Boolean,
            required: false,
            default: false,
        },
    },
    emits: ['update:itemType'],
    data() {
        return {
            isOpen: false,
            results: [],
            search: "",
            isLoading: false,
            arrowCounter: -1,
        };
    },
    watch: {
        items: function (value, oldValue) {
            if (value.length !== oldValue.length) {
                this.results = value;
                this.isLoading = false;
            }
        },
    },
    mounted() {
        document.addEventListener("click", this.handleClickOutside);
    },
    unmounted() {
        document.removeEventListener("click", this.handleClickOutside);
    },
    methods: {
        setResult(result) {
            this.search = result;
            this.isOpen = false;
        },
        filterResults() {
            this.results = this.items.filter((item) => {
                return item.toLowerCase().indexOf(this.search.toLowerCase()) > -1;
            });
        },
        onChange() {
            this.$emit('update:itemType', this.search)

            if (this.isAsync) {
                this.isLoading = true;
            } else {
                this.filterResults();
                this.isOpen = true;
            }
        },
        handleClickOutside(event) {
            if (!this.$el.contains(event.target)) {
                this.isOpen = false;
                this.arrowCounter = -1;
            }
        },
        onArrowDown() {
            if (this.arrowCounter < this.results.length) {
                this.arrowCounter = this.arrowCounter + 1;
            }
        },
        onArrowUp() {
            if (this.arrowCounter > 0) {
                this.arrowCounter = this.arrowCounter - 1;
            }
        },
        onEnter() {
            this.search = this.results[this.arrowCounter];
            this.isOpen = false;
            this.arrowCounter = -1;
        },
    },
};
</script>

<style>
.autocomplete {
    position: relative;
}

.autocomplete-results {
    width: 100% !important;
    padding: 1rem;
    position: absolute;
    margin: 0;
    border: 1px solid #e9e9e9;
    border-radius: 0.5rem;
    overflow: auto;
}

.autocomplete-result {
    list-style: none;
    text-align: left;
    cursor: pointer;
}

.autocomplete-result.is-active,
.autocomplete-result:hover {
    background-color: #4AAE9B;
    color: white;
}
</style>