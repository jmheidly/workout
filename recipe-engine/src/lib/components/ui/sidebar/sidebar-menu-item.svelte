<script>
  import { cn } from '$lib/utils.js'

  let { class: className = '', children, ...restProps } = $props()
</script>

<li
  class={cn('group/menu-item relative', className)}
  {...restProps}
>
  {@render children()}
</li>
