<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<div class={cn('flex items-center', className)} {...restProps}>
  {@render children?.()}
</div>
