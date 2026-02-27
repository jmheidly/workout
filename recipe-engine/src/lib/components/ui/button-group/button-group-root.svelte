<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<div
  class={cn(
    'inline-flex items-center rounded-md [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none [&>*:not(:first-child):not(:last-child)]:rounded-none',
    className
  )}
  role="group"
  {...restProps}
>
  {@render children()}
</div>
