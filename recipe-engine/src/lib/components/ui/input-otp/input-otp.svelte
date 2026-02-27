<script>
  import { cn } from '$lib/utils.js'
  import { PinInput } from 'bits-ui'

  let {
    value = $bindable(''),
    maxlength = 6,
    onComplete,
    class: className = '',
    children,
    ...restProps
  } = $props()
</script>

<PinInput.Root
  bind:value
  {maxlength}
  {onComplete}
  class={cn('flex items-center gap-2', className)}
  {...restProps}
>
  {#snippet children(props)}
    {@render children?.(props)}
  {/snippet}
</PinInput.Root>
