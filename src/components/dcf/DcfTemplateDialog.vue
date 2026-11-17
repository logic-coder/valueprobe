<template>
  <q-dialog v-model="visible">
    <q-card>
      <q-card-section>
        <div v-if="action === 'save'" class="text-h6">{{ t('save_dcf_params_as_template') }}</div>
        <div v-if="action === 'delete'" class="text-h6">{{ t('delete_dcf_params') }}</div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <q-separator />
        <q-markup-table flat>
          <tr>
            <td>{{ t('name') }}</td>
            <td>
              <q-input v-if="action !== 'delete'" v-model="name" dense outlined />
              <font v-else>{{ selected?.name }}</font>
            </td>
          </tr>
          <tr><td>{{ basedOn === 'eps' ? t('eps') : t('total_freecashflow') }}</td><td>{{ money(stock.currency, basedOn === 'eps' ? form.eps : form.freecashflow) }}</td></tr>
          <tr><td>{{ t('growth_year_in_the_next') }}</td><td>{{ form.years }}</td></tr>
          <tr><td>{{ t('growth_rate_in_the_next') }}</td><td>{{ form.growthRate }}%</td></tr>
          <tr><td>{{ t('years_of_terminal_growth') }}</td><td>{{ form.yearsOfTerminalGrowth }}</td></tr>
          <tr><td>{{ t('terminal_growth_rate') }}</td><td>{{ form.terminalGrowthRate }}%</td></tr>
          <tr><td>{{ t('discount_rate') }}</td><td>{{ form.discountRate }}%</td></tr>
          <tr><td>{{ t('book') }}</td><td>{{ stock.currency }} {{ result.tbv }}</td></tr>
        </q-markup-table>
        <q-separator />
      </q-card-section>
      <q-card-actions align="right">
        <q-btn v-if="action === 'save'" color="primary" :label="operating ? operatingLabel : t('save')" @click="emit('save')" />
        <q-btn v-if="action === 'delete'" color="primary" :label="operating ? operatingLabel : t('delete')" @click="emit('delete')" />
        <q-btn color="primary" flat :label="t('cancel')" @click="visible = false" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { money } from '../../lib/format'

const visible = defineModel('visible', { type: Boolean, default: false })
const name = defineModel('name', { type: String, default: '' })
defineProps({
  action: { type: String, default: 'save' },
  selected: { type: Object, default: null },
  basedOn: { type: String, default: 'eps' },
  form: { type: Object, required: true },
  stock: { type: Object, default: () => ({}) },
  result: { type: Object, required: true },
  operating: { type: Boolean, default: false },
  operatingLabel: { type: String, default: '' },
})
const emit = defineEmits(['save', 'delete'])
const { t } = useI18n()
</script>
