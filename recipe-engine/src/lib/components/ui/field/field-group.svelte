<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<div class={cn('grid gap-4', className)} {...restProps}>
  {@render children()}
</div>
