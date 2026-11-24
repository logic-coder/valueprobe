import { defineStore } from 'pinia'
import { readCompare, removeCompare, toggleCompare, writeCompare } from '../lib/compareList'

// Reactive shell over the local compare queue; the page still owns the URL.
export const useCompareStore = defineStore('compare', {
  state: () => ({ symbols: readCompare() }),
  actions: {
    toggle(symbol) { this.symbols = toggleCompare(symbol) },
    remove(symbol) { this.symbols = removeCompare(symbol) },
    restore(list) { this.symbols = writeCompare(list) },
    replace(list) { this.symbols = list },
    reload() { this.symbols = readCompare() },
  },
})
