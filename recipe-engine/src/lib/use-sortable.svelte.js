import Sortable from 'sortablejs'

/**
 * Svelte 5 hook for SortableJS.
 * Accepts a getter returning an HTMLElement and optional SortableJS options.
 *
 * @param {() => HTMLElement | null} getter
 * @param {Sortable.Options} [options]
 */
export function useSortable(getter, options) {
  $effect(() => {
    const el = getter()
    const sortable = el ? Sortable.create(el, options) : null
    return () => sortable?.destroy()
  })
}

/**
 * Reorder an array based on a SortableJS event.
 * Uses $state.snapshot() for Svelte 5 compatibility.
 *
 * @template T
 * @param {T[]} array
 * @param {Sortable.SortableEvent} evt
 * @returns {T[]}
 */
export function reorder(array, evt) {
  const work = $state.snapshot(array)
  const { oldIndex, newIndex } = evt

  if (oldIndex === undefined || newIndex === undefined) return work
  if (oldIndex === newIndex) return work

  const target = work[oldIndex]
  const increment = newIndex < oldIndex ? -1 : 1

  for (let k = oldIndex; k !== newIndex; k += increment) {
    work[k] = work[k + increment]
  }
  work[newIndex] = target
  return work
}
