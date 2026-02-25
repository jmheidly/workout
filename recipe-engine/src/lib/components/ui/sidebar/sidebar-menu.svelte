<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<ul
  class={cn('flex w-full min-w-0 flex-col gap-1', className)}
  {...restProps}
>
  {@render children()}
</ul>
