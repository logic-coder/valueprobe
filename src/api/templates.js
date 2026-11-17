import { readStored, writeStored } from '../lib/storage'

const KEY = 'fv-dcf-templates'

const read = () => {
  try {
    return JSON.parse(readStored(KEY, '[]'))
  } catch (error) {
    return []
  }
}
const write = (list) => { writeStored(KEY, JSON.stringify(list)) }

export const getUserDcfTemplate = () => read()

export function createUserDcfTemplate (payload) {
  const list = read()
  list.push({ id: Date.now(), ...payload })
  write(list)
  return true
}

export function updateUserDcfTemplate (id, payload) {
  const list = read()
  const index = list.findIndex((item) => item.id === id)
  if (index < 0) return false
  list[index] = { ...list[index], ...payload }
  write(list)
  return true
}

export function deleteUserDcfTemplate (id) {
  write(read().filter((item) => item.id !== id))
  return true
}
