<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', href = '#', children, ...restProps } = $props()
</script>

<a
  {href}
  class={cn('transition-colors hover:text-foreground', className)}
  {...restProps}
>
  {@render children()}
</a>
