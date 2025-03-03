<script lang="ts" setup>
import type { ColumnType, LinkToAnotherRecordType, LookupType } from 'nocodb-sdk'
import { RelationTypes, UITypes, isVirtualCol } from 'nocodb-sdk'

const { metas, getMeta } = useMetas()

const column = inject(ColumnInj, ref())

const meta = inject(MetaInj, ref())

const cellValue = inject(CellValueInj, ref())

const isGroupByLabel = inject(IsGroupByLabelInj, ref(false))

// Change the row height of the child cell under lookup
// Other wise things like text will can take multi line tag
const providedHeightRef = ref(1) as any

const rowHeight = inject(RowHeightInj, ref(1) as any)

provide(RowHeightInj, providedHeightRef)

const relationColumn = computed(() =>
  meta.value?.id
    ? metas.value[meta.value?.id]?.columns?.find(
        (c: ColumnType) => c.id === (column.value?.colOptions as LookupType)?.fk_relation_column_id,
      )
    : undefined,
)

watch(
  relationColumn,
  async (relationCol: { colOptions: LinkToAnotherRecordType }) => {
    if (relationCol && relationCol.colOptions) await getMeta(relationCol.colOptions.fk_related_model_id!)
  },
  { immediate: true },
)

const lookupTableMeta = computed<Record<string, any> | undefined>(() => {
  if (relationColumn.value && relationColumn.value?.colOptions)
    return metas.value[relationColumn.value.colOptions.fk_related_model_id!]

  return undefined
})

const lookupColumn = computed(
  () =>
    lookupTableMeta.value?.columns?.find((c: any) => c.id === (column.value?.colOptions as LookupType)?.fk_lookup_column_id) as
      | ColumnType
      | undefined,
)

watch([lookupColumn, rowHeight], () => {
  if (lookupColumn.value && !isAttachment(lookupColumn.value)) {
    providedHeightRef.value = 1
  } else {
    providedHeightRef.value = rowHeight.value
  }
})

const arrValue = computed(() => {
  if (!cellValue.value) return []

  // if lookup column is Attachment and relation type is Belongs/OneToOne to wrap the value in an array
  // since the attachment component expects an array or JSON string array
  if (
    lookupColumn.value?.uidt === UITypes.Attachment &&
    [RelationTypes.BELONGS_TO, RelationTypes.ONE_TO_ONE].includes(relationColumn.value?.colOptions?.type)
  )
    return [cellValue.value]

  // TODO: We are filtering null as cell value can be null. Find the root cause and fix it
  if (Array.isArray(cellValue.value)) return cellValue.value.filter((v) => v !== null)

  return [cellValue.value]
})

provide(MetaInj, lookupTableMeta)

provide(IsUnderLookupInj, ref(true))

provide(CellUrlDisableOverlayInj, ref(true))

const { showEditNonEditableFieldWarning, showClearNonEditableFieldWarning, activateShowEditNonEditableFieldWarning } =
  useShowNotEditableWarning()
</script>

<template>
  <div
    class="nc-cell-field h-full w-full nc-lookup-cell"
    tabindex="-1"
    :style="{
      height: isGroupByLabel
        ? undefined
        : rowHeight
        ? `${rowHeight === 1 ? rowHeightInPx['1'] - 4 : rowHeightInPx[`${rowHeight}`] - 18}px`
        : `2.85rem`,
    }"
    @dblclick="activateShowEditNonEditableFieldWarning"
  >
    <div
      class="h-full w-full flex gap-1"
      :class="{
        '!overflow-x-auto nc-cell-lookup-scroll nc-scrollbar-x-md !overflow-y-hidden': rowHeight === 1,
      }"
    >
      <template v-if="lookupColumn">
        <!-- Render virtual cell -->
        <div v-if="isVirtualCol(lookupColumn)" class="flex h-full">
          <!-- If non-belongs-to and non-one-to-one LTAR column then pass the array value, else iterate and render -->
          <template
            v-if="
              lookupColumn.uidt !== UITypes.LinkToAnotherRecord ||
              (lookupColumn.uidt === UITypes.LinkToAnotherRecord &&
                [RelationTypes.BELONGS_TO, RelationTypes.ONE_TO_ONE].includes(lookupColumn.colOptions.type))
            "
          >
            <LazySmartsheetVirtualCell
              v-for="(v, i) of arrValue"
              :key="i"
              :edit-enabled="false"
              :model-value="v"
              :column="lookupColumn"
              :read-only="true"
            />
          </template>

          <LazySmartsheetVirtualCell
            v-else
            :edit-enabled="false"
            :read-only="true"
            :model-value="arrValue"
            :column="lookupColumn"
          />
        </div>

        <!-- Render normal cell -->
        <template v-else>
          <div v-if="isAttachment(lookupColumn) && arrValue[0] && !Array.isArray(arrValue[0]) && typeof arrValue[0] === 'object'">
            <LazySmartsheetCell :model-value="arrValue" :column="lookupColumn" :edit-enabled="false" :read-only="true" />
          </div>
          <!-- For attachment cell avoid adding chip style -->
          <template v-else>
            <div
              class="max-h-full max-w-full w-full nc-cell-lookup-scroll"
              :class="{
                'nc-scrollbar-md ': rowHeight !== 1 && !isAttachment(lookupColumn),
              }"
            >
              <div
                class="flex gap-1.5 w-full h-full py-[3px]"
                :class="{
                  'flex-wrap': rowHeight !== 1 && !isAttachment(lookupColumn),
                  '!overflow-x-auto nc-cell-lookup-scroll nc-scrollbar-x-md !overflow-y-hidden':
                    rowHeight === 1 || isAttachment(lookupColumn),
                  'items-center': rowHeight === 1,
                  'items-start': rowHeight !== 1,
                }"
              >
                <div
                  v-for="(v, i) of arrValue"
                  :key="i"
                  class="flex-none"
                  :class="{
                    'bg-gray-100 rounded-full': !isAttachment(lookupColumn),
                    'border-gray-200 rounded border-1': ![
                      UITypes.Attachment,
                      UITypes.MultiSelect,
                      UITypes.SingleSelect,
                      UITypes.User,
                      UITypes.CreatedBy,
                      UITypes.LastModifiedBy,
                    ].includes(lookupColumn.uidt),
                    'min-h-0 min-w-0': isAttachment(lookupColumn),
                  }"
                >
                  <LazySmartsheetCell
                    :model-value="v"
                    :column="lookupColumn"
                    :edit-enabled="false"
                    :virtual="true"
                    :read-only="true"
                    :class="[
                      `${
                        [UITypes.MultiSelect, UITypes.SingleSelect, UITypes.User].includes(lookupColumn.uidt)
                          ? 'pl-2'
                          : !isAttachment(lookupColumn)
                          ? 'px-2'
                          : ''
                      }`,
                      {
                        'min-h-0 min-w-0': isAttachment(lookupColumn),
                        '!w-auto ': !isAttachment(lookupColumn),
                      },
                    ]"
                  />
                </div>
              </div>
              <div v-if="showEditNonEditableFieldWarning" class="text-left text-wrap mt-2 text-[#e65100] text-xs">
                {{ $t('msg.info.computedFieldEditWarning') }}
              </div>
              <div v-if="showClearNonEditableFieldWarning" class="text-left text-wrap mt-2 text-[#e65100] text-xs">
                {{ $t('msg.info.computedFieldDeleteWarning') }}
              </div>
            </div>
          </template>
        </template>
      </template>
    </div>
  </div>
</template>

<style lang="scss">
.nc-cell-lookup-scroll {
  &::-webkit-scrollbar-thumb {
    @apply bg-transparent;
  }
}
.nc-cell-lookup-scroll:hover {
  &::-webkit-scrollbar-thumb {
    @apply bg-gray-200;
  }
}

.nc-lookup-cell .nc-text-area-clamped-text {
  @apply !mr-1;
}
</style>
