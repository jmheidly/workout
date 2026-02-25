<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<div
  class={cn(
    'flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto group-data-[collapsible=icon]/sidebar:overflow-hidden',
    className
  )}
  {...restProps}
>
  {@render children()}
</div>
