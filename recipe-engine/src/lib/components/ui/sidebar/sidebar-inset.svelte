<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<main
  class={cn(
    'relative flex min-h-svh flex-1 flex-col bg-background',
    className
  )}
  {...restProps}
>
  {@render children()}
</main>
