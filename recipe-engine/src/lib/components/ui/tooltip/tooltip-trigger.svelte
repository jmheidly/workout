<script>
  import { Tooltip } from 'bits-ui'

  let { children, ...restProps } = $props()
</script>

<Tooltip.Trigger {...restProps}>
  {@render children()}
</Tooltip.Trigger>
