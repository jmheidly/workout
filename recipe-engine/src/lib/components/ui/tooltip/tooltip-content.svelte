<script>
  import { cn } from '$lib/utils.js'
  import { Tooltip } from 'bits-ui'

  let {
    class: className = '',
    side = 'top',
    sideOffset = 4,
    children,
    ...restProps
  } = $props()
</script>

<Tooltip.Portal>
  <Tooltip.Content
    {side}
    {sideOffset}
    class={cn(
      'z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95',
      className
    )}
    {...restProps}
  >
    {@render children()}
  </Tooltip.Content>
</Tooltip.Portal>
