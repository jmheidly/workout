<script>
  import { cn } from '$lib/utils.js'
  import { Select } from 'bits-ui'

  let { class: className = '', children, ...restProps } = $props()
</script>

<Select.Portal>
  <Select.Content
    class={cn(
      'relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md',
      className
    )}
    sideOffset={4}
    {...restProps}
  >
    <Select.Viewport class="p-1">
      {#if children}
        {@render children()}
      {/if}
    </Select.Viewport>
  </Select.Content>
</Select.Portal>
