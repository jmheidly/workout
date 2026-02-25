<script>
  import { cn } from '$lib/utils.js'
  import { useSidebar } from './sidebar-state.svelte.js'

  let { class: className = '', ...restProps } = $props()

  const sidebar = useSidebar()
</script>

<button
  type="button"
  onclick={() => sidebar.toggle()}
  class={cn(
    'inline-flex h-7 w-7 items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground',
    className
  )}
  aria-label="Toggle sidebar"
  {...restProps}
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
</button>
