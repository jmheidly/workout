<script>
  import { cn } from '$lib/utils.js'

  let {
    class: className = '',
    children,
    ...restProps
  } = $props()
</script>

<div
  class={cn('px-2 py-1.5 text-sm font-semibold', className)}
  {...restProps}
>
  {@render children()}
</div>
