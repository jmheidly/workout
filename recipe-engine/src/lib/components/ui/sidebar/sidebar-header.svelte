<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<div
  class={cn(
    'flex flex-col gap-2 p-2 group-data-[collapsible=icon]/sidebar:p-2',
    className
  )}
  {...restProps}
>
  {@render children()}
</div>
