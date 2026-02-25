<script>
  import { cn } from '$lib/utils.js'
  import { DropdownMenu } from 'bits-ui'

  let { class: className = '', ...restProps } = $props()
</script>

<DropdownMenu.Separator
  class={cn('-mx-1 my-1 h-px bg-muted', className)}
  {...restProps}
/>
