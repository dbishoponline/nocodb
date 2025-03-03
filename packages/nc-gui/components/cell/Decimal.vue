<script lang="ts" setup>
import type { VNodeRef } from '@vue/runtime-core'

interface Props {
  // when we set a number, then it is number type
  // for sqlite, when we clear a cell or empty the cell, it returns ""
  // otherwise, it is null type
  modelValue?: number | null | string
  placeholder?: string
}

interface Emits {
  (event: 'update:modelValue', model: number): void
}

const props = defineProps<Props>()

const emits = defineEmits<Emits>()

const { showNull } = useGlobal()

const editEnabled = inject(EditModeInj)

const column = inject(ColumnInj, null)!

const isEditColumn = inject(EditColumnInj, ref(false))

const readOnly = inject(ReadonlyInj, ref(false))

const domRef = ref<HTMLElement>()

const meta = computed(() => {
  return typeof column?.value.meta === 'string' ? JSON.parse(column.value.meta) : column?.value.meta ?? {}
})

const _vModel = useVModel(props, 'modelValue', emits)

const displayValue = computed(() => {
  if (_vModel.value === null) return null

  if (isNaN(Number(_vModel.value))) return null

  if (meta.value.isLocaleString) return (+Number(_vModel.value).toFixed(meta.value.precision ?? 1)).toLocaleString()

  return Number(_vModel.value).toFixed(meta.value.precision ?? 1)
})

const vModel = computed({
  get: () => _vModel.value,
  set: (value) => {
    if (value === '') {
      // if we clear / empty a cell in sqlite,
      // the value is considered as ''
      _vModel.value = null
    } else {
      _vModel.value = value
    }
  },
})

const precision = computed(() => {
  const meta = typeof column?.value.meta === 'string' ? JSON.parse(column.value.meta) : column?.value.meta ?? {}
  const _precision = meta.precision ?? 1

  return Number(0.1 ** _precision).toFixed(_precision)
})

const isExpandedFormOpen = inject(IsExpandedFormOpenInj, ref(false))!

const isForm = inject(IsFormInj)!

// Handle the arrow keys as its default behavior is to increment/decrement the value
const onKeyDown = (e: any) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    // Move the cursor to the end of the input
    e.target.type = 'text'
    e.target?.setSelectionRange(e.target.value.length, e.target.value.length)
    e.target.type = 'number'
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()

    e.target.type = 'text'
    e.target?.setSelectionRange(0, 0)
    e.target.type = 'number'
  }
}

const focus: VNodeRef = (el) =>
  !isExpandedFormOpen.value && !isEditColumn.value && !isForm.value && (el as HTMLInputElement)?.focus()

watch(isExpandedFormOpen, () => {
  if (!isExpandedFormOpen.value) {
    domRef.value?.focus()
  }
})
</script>

<template>
  <input
    v-if="!readOnly && editEnabled"
    :ref="focus"
    v-model="vModel"
    class="nc-cell-field outline-none py-1 border-none rounded-md w-full h-full"
    type="number"
    :step="precision"
    :placeholder="placeholder"
    style="letter-spacing: 0.06rem"
    @blur="editEnabled = false"
    @keydown.down.stop="onKeyDown"
    @keydown.left.stop
    @keydown.right.stop
    @keydown.up.stop="onKeyDown"
    @keydown.delete.stop
    @selectstart.capture.stop
    @mousedown.stop
  />
  <span v-else-if="vModel === null && showNull" class="nc-cell-field nc-null uppercase">{{ $t('general.null') }}</span>
  <span v-else class="nc-cell-field">{{ displayValue }}</span>
</template>

<style scoped lang="scss">
input[type='number']:focus {
  @apply ring-transparent;
}

/* Chrome, Safari, Edge, Opera */
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* Firefox */
input[type='number'] {
  -moz-appearance: textfield;
}
</style>
