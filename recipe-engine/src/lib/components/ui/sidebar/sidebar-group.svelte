<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<div
  class={cn(
    'relative flex w-full min-w-0 flex-col p-2 group-data-[collapsible=icon]/sidebar:overflow-hidden group-data-[collapsible=icon]/sidebar:p-0',
    className
  )}
  {...restProps}
>
  {@render children()}
</div>
