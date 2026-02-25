<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<span
  role="link"
  aria-disabled="true"
  aria-current="page"
  class={cn('font-normal text-foreground', className)}
  {...restProps}
>
  {@render children()}
</span>
