<script setup lang="ts">
const props = defineProps<{
  value: any
}>()

const emit = defineEmits(['update:value'])

const precisionFormats = [1, 2, 3, 4, 5, 6, 7, 8]

const { t } = useI18n()

const precisionFormatsDisplay = {
  1: t('placeholder.decimal1'),
  2: t('placeholder.decimal2'),
  3: t('placeholder.decimal3'),
  4: t('placeholder.decimal4'),
  5: t('placeholder.decimal5'),
  6: t('placeholder.decimal6'),
  7: t('placeholder.decimal7'),
  8: t('placeholder.decimal8'),
}

const vModel = useVModel(props, 'value', emit)

// set default value
vModel.value.meta = {
  precision: precisionFormats[0],
  isLocaleString: false,
  ...(vModel.value.meta || {}),
}

// update datatype precision when precision is less than the new value
// avoid downgrading precision if the new value is less than the current precision
// to avoid fractional part data loss(eg. 1.2345 -> 1.23)
const onPrecisionChange = (value: number) => {
  vModel.value.dtxs = Math.max(value, vModel.value.dtxs)
}
</script>

<template>
  <a-form-item :label="$t('placeholder.precision')">
    <a-select
      v-if="vModel.meta?.precision"
      v-model:value="vModel.meta.precision"
      dropdown-class-name="nc-dropdown-decimal-format"
      @change="onPrecisionChange"
    >
      <template #suffixIcon>
        <GeneralIcon icon="arrowDown" class="text-gray-700" />
      </template>
      <a-select-option v-for="(format, i) of precisionFormats" :key="i" :value="format">
        <div class="flex gap-2 w-full justify-between items-center">
          {{ (precisionFormatsDisplay as any)[format] }}
          <component
            :is="iconMap.check"
            v-if="vModel.meta.precision === format"
            id="nc-selected-item-icon"
            class="text-primary w-4 h-4"
          />
        </div>
      </a-select-option>
    </a-select>
  </a-form-item>

  <a-form-item>
    <div class="flex items-center gap-1">
      <NcSwitch v-if="vModel.meta" v-model:checked="vModel.meta.isLocaleString">
        <div class="text-sm text-gray-800 select-none">{{ $t('labels.showThousandsSeparator') }}</div>
      </NcSwitch>
    </div>
  </a-form-item>
</template>
