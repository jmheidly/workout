import { getContext, setContext } from 'svelte'

const SIDEBAR_KEY = Symbol.for('sidebar')
const SIDEBAR_COOKIE = 'sidebar:state'

export class SidebarState {
  open = $state(true)
  openMobile = $state(false)
  isMobile = $state(false)

  constructor(defaultOpen = true) {
    this.open = defaultOpen

    $effect(() => {
      const mql = window.matchMedia('(max-width: 768px)')
      this.isMobile = mql.matches

      const handler = (e) => {
        this.isMobile = e.matches
      }
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    })
  }

  toggle() {
    if (this.isMobile) {
      this.openMobile = !this.openMobile
    } else {
      this.setOpen(!this.open)
    }
  }

  setOpen(value) {
    this.open = value
    document.cookie = `${SIDEBAR_COOKIE}=${value}; path=/; max-age=${
      60 * 60 * 24 * 7
    }`
  }
}

export function setSidebar(defaultOpen = true) {
  const state = new SidebarState(defaultOpen)
  setContext(SIDEBAR_KEY, state)
  return state
}

export function useSidebar() {
  return getContext(SIDEBAR_KEY)
}
