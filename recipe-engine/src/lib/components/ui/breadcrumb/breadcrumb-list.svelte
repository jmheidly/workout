<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<ol
  class={cn(
    'flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5',
    className
  )}
  {...restProps}
>
  {@render children()}
</ol>
