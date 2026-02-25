<script>
  import { cn } from '$lib/utils.js'
  import { Tooltip } from 'bits-ui'
  import { setSidebar } from './sidebar-state.svelte.js'

  let {
    class: className = '',
    defaultOpen = true,
    children,
    ...restProps
  } = $props()

  const sidebar = setSidebar(defaultOpen)

  function handleKeydown(e) {
    if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      sidebar.toggle()
    }
  }
</script>

<svelte:document onkeydown={handleKeydown} />

<Tooltip.Provider delayDuration={0}>
  <div
    class={cn('group/sidebar-wrapper flex min-h-svh w-full', className)}
    style="--sidebar-width: 16rem; --sidebar-width-icon: 3rem;"
    data-sidebar-state={sidebar.open ? 'expanded' : 'collapsed'}
    {...restProps}
  >
    {@render children()}
  </div>
</Tooltip.Provider>
