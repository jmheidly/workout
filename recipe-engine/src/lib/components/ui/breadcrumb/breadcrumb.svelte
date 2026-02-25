<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<nav aria-label="breadcrumb" class={cn(className)} {...restProps}>
  {@render children()}
</nav>
