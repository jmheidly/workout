<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<li
  class={cn('inline-flex items-center gap-1.5', className)}
  {...restProps}
>
  {@render children()}
</li>
