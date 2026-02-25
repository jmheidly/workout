<script>
  import { cn } from '$lib/utils.js'
  import { useSidebar } from './sidebar-state.svelte.js'

  let { class: className = '', collapsible = 'icon', children, ...restProps } = $props()

  const sidebar = useSidebar()
</script>

<!-- Mobile overlay -->
{#if sidebar.isMobile}
  {#if sidebar.openMobile}
    <!-- backdrop -->
    <div
      class="fixed inset-0 z-50 bg-black/50"
      role="button"
      tabindex="-1"
      onclick={() => (sidebar.openMobile = false)}
      onkeydown={(e) => e.key === 'Escape' && (sidebar.openMobile = false)}
    ></div>
    <!-- drawer -->
    <aside
      data-sidebar="sidebar"
      data-mobile="true"
      class={cn(
        'group/sidebar fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col bg-sidebar text-sidebar-foreground shadow-lg',
        className
      )}
      {...restProps}
    >
      {@render children()}
    </aside>
  {/if}
{:else}
  <!-- Desktop sidebar -->
  <!-- Gap element that reserves space -->
  <div
    class="relative h-svh shrink-0 bg-transparent transition-[width] duration-200 ease-linear"
    style="width: {sidebar.open ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)'};"
  ></div>
  <!-- Fixed sidebar -->
  <aside
    data-sidebar="sidebar"
    data-state={sidebar.open ? 'expanded' : 'collapsed'}
    data-collapsible={sidebar.open ? '' : collapsible}
    class={cn(
      'group/sidebar peer fixed inset-y-0 left-0 z-10 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear',
      sidebar.open ? 'w-[var(--sidebar-width)]' : 'w-[var(--sidebar-width-icon)]',
      className
    )}
    {...restProps}
  >
    {@render children()}
  </aside>
{/if}
