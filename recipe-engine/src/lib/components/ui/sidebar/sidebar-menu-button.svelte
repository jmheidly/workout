<script>
  import { cn } from '$lib/utils.js'
  import { useSidebar } from './sidebar-state.svelte.js'
  import * as Tooltip from '$lib/components/ui/tooltip/index.js'

  let {
    class: className = '',
    href = undefined,
    isActive = false,
    size = 'default',
    tooltipContent: tooltipLabel = '',
    children,
    ...restProps
  } = $props()

  const sidebar = useSidebar()

  const sizeClasses = {
    default: 'h-8 text-sm',
    sm: 'h-7 text-xs',
    lg: 'h-12 text-sm group-data-[collapsible=icon]/sidebar:!p-0',
  }

  const buttonClass = $derived(
    cn(
      'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left outline-none ring-sidebar-ring transition-[width,height,padding]',
      'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      'active:bg-sidebar-accent active:text-sidebar-accent-foreground',
      'data-[active]:bg-sidebar-accent data-[active]:font-medium data-[active]:text-sidebar-accent-foreground',
      'data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground',
      'group-data-[collapsible=icon]/sidebar:!size-8 group-data-[collapsible=icon]/sidebar:!p-2',
      '[&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
      sizeClasses[size] || sizeClasses.default,
      className
    )
  )
</script>

{#if !sidebar.isMobile && !sidebar.open && tooltipLabel}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#if href}
        <a
          {href}
          data-active={isActive || undefined}
          data-sidebar="menu-button"
          data-size={size}
          class={buttonClass}
          {...restProps}
        >
          {@render children()}
        </a>
      {:else}
        <button
          type="button"
          data-active={isActive || undefined}
          data-sidebar="menu-button"
          data-size={size}
          class={buttonClass}
          {...restProps}
        >
          {@render children()}
        </button>
      {/if}
    </Tooltip.Trigger>
    <Tooltip.Content side="right">{tooltipLabel}</Tooltip.Content>
  </Tooltip.Root>
{:else if href}
  <a
    {href}
    data-active={isActive || undefined}
    data-sidebar="menu-button"
    data-size={size}
    class={buttonClass}
    {...restProps}
  >
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    data-active={isActive || undefined}
    data-sidebar="menu-button"
    data-size={size}
    class={buttonClass}
    {...restProps}
  >
    {@render children()}
  </button>
{/if}
