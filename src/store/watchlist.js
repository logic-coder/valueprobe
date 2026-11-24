import { defineStore } from 'pinia'
import { readWatchlist, removeWatch, toggleWatch, writeWatchlist } from '../lib/watchlist'

// Thin reactive shell over the local storage helpers so the star and the list
// page stay in sync without either owning the persistence format.
export const useWatchlistStore = defineStore('watchlist', {
  state: () => ({ symbols: readWatchlist() }),
  actions: {
    toggle(symbol) {
      this.symbols = toggleWatch(symbol)
    },
    remove(symbol) {
      this.symbols = removeWatch(symbol)
    },
    restore(list) {
      this.symbols = writeWatchlist(list)
    },
    reload() {
      this.symbols = readWatchlist()
    },
  },
})
