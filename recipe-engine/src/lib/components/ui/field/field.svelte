<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<div class={cn('grid gap-2', className)} {...restProps}>
  {@render children()}
</div>
