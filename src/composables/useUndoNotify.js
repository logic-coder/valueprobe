import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'

/**
 * Undo for local, reversible list edits. Every destructive action keeps a
 * snapshot of the prior state and offers a real way back; nothing is silently
 * discarded. Quasar already owns Notify, so no new UI surface is introduced.
 *
 * @param {(snapshot: any) => void} restore called with the captured snapshot on undo
 */
export function useUndoNotify () {
  const $q = useQuasar()
  const { t } = useI18n()

  const notifyUndo = (message, snapshot, restore) => {
    $q.notify({
      message,
      icon: 'undo',
      color: 'grey-9',
      timeout: 6000,
      actions: [{ label: t('undo'), color: 'primary', handler: () => restore(snapshot) }],
    })
  }

  return { notifyUndo }
}
