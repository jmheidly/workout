<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<div
  class={cn(
    'flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opacity] duration-200 [&>svg]:size-4 [&>svg]:shrink-0',
    'group-data-[collapsible=icon]/sidebar:opacity-0',
    className
  )}
  {...restProps}
>
  {@render children()}
</div>
