<script>
  import { cn } from '$lib/utils.js'

  let {
    class: className = '',
    orientation = 'horizontal',
    ...restProps
  } = $props()
</script>

<div
  role="separator"
  aria-orientation={orientation}
  data-orientation={orientation}
  class={cn(
    'shrink-0 bg-border',
    orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
    className
  )}
  {...restProps}
></div>
