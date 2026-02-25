<script>
  import { cn } from '$lib/utils.js'
  import { Select } from 'bits-ui'

  let { class: className = '', children, ...restProps } = $props()
</script>

<Select.Trigger
  class={cn(
    'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-ring transition-shadow placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
    className
  )}
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 opacity-50"><path d="m6 9 6 6 6-6"/></svg>
</Select.Trigger>
