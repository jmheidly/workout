<script>
  import { page } from '$app/stores'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'
  import { useSidebar } from '$lib/components/ui/sidebar/index.js'

  const sidebar = useSidebar()

  let { user = null, bakery = null, subscription = null } = $props()

  const TRIAL_TOTAL_DAYS = 14

  const navItems = [
    {
      label: 'Recipes',
      href: '/recipes',
      icon: 'book',
    },
    {
      label: 'Production',
      href: '/production',
      icon: 'clock',
    },
    {
      label: 'Templates',
      href: '/templates',
      icon: 'layers',
    },
    {
      label: 'Inventory',
      href: '/inventory',
      icon: 'package',
    },
    {
      label: 'Reports',
      href: '/reports',
      icon: 'chart',
    },
  ]

  const settingsItems = [
    {
      label: 'Mixers',
      href: '/mixers',
      icon: 'mixer',
    },
    {
      label: 'Billing',
      href: '/bakeries/settings/billing',
      icon: 'credit-card',
    },
    {
      label: 'Bakery Settings',
      href: '/bakeries/settings',
      icon: 'settings',
    },
  ]

  function isActive(href) {
    const path = $page.url.pathname
    if (href === '/recipes') {
      return path === '/recipes' || path.startsWith('/recipes/')
    }
    if (href === '/templates') {
      return path === '/templates' || path.startsWith('/templates/')
    }
    return path.startsWith(href)
  }
</script>

<Sidebar.Sidebar>
  <Sidebar.Header>
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton size="lg" href="/bakeries" tooltipContent="Switch Bakery">
          <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
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
              <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z" />
              <line x1="6" x2="18" y1="17" y2="17" />
            </svg>
          </div>
          <div class="grid flex-1 text-left text-sm leading-tight">
            <span class="truncate font-semibold">{bakery?.name || 'Recipe Engine'}</span>
            <span class="truncate text-xs">Bakery Management</span>
          </div>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Header>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
      <Sidebar.Menu>
        {#each navItems as item}
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              href={item.href}
              isActive={isActive(item.href)}
              tooltipContent={item.label}
            >
              {#if item.icon === 'layers'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></svg>
              {:else if item.icon === 'book'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" /></svg>
              {:else if item.icon === 'clock'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              {:else if item.icon === 'package'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24" /><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.29 7 12 12 20.71 7" /><line x1="12" x2="12" y1="22" y2="12" /></svg>
              {:else if item.icon === 'chart'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="16" /></svg>
              {/if}
              <span>{item.label}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        {/each}
      </Sidebar.Menu>
    </Sidebar.Group>

    <Sidebar.Group>
      <Sidebar.GroupLabel>Settings</Sidebar.GroupLabel>
      <Sidebar.Menu>
        {#each settingsItems as item}
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              href={item.href}
              isActive={isActive(item.href)}
              tooltipContent={item.label}
            >
              {#if item.icon === 'credit-card'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
              {:else if item.icon === 'mixer'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14" /><line x1="4" x2="4" y1="10" y2="3" /><line x1="12" x2="12" y1="21" y2="12" /><line x1="12" x2="12" y1="8" y2="3" /><line x1="20" x2="20" y1="21" y2="16" /><line x1="20" x2="20" y1="12" y2="3" /><line x1="2" x2="6" y1="14" y2="14" /><line x1="10" x2="14" y1="8" y2="8" /><line x1="18" x2="22" y1="16" y2="16" /></svg>
              {:else if item.icon === 'settings'}
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
              {/if}
              <span>{item.label}</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        {/each}
      </Sidebar.Menu>
    </Sidebar.Group>
  </Sidebar.Content>

  {#if subscription?.reason === 'trial' && subscription.trialDaysLeft != null}
    <div class="px-3 pb-2">
      <a
        href="/bakeries/settings/billing"
        class="group relative block overflow-hidden rounded-lg border border-sidebar-border bg-gradient-to-br from-sidebar-accent/50 to-sidebar-accent/20 p-3 transition-colors hover:from-sidebar-accent/70 hover:to-sidebar-accent/30"
      >
        <div class="mb-2 flex items-center gap-2">
          <div class="flex size-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
          </div>
          <span class="text-xs font-semibold text-sidebar-foreground">Free Trial</span>
        </div>
        <div class="mb-1.5 flex items-baseline justify-between">
          <span class="text-[11px] text-sidebar-foreground/70">{subscription.trialDaysLeft} day{subscription.trialDaysLeft === 1 ? '' : 's'} remaining</span>
        </div>
        <div class="mb-2.5 h-1.5 overflow-hidden rounded-full bg-sidebar-foreground/10">
          <div
            class="h-full rounded-full bg-amber-500 transition-all"
            style="width: {Math.max(4, (subscription.trialDaysLeft / TRIAL_TOTAL_DAYS) * 100)}%"
          ></div>
        </div>
        <span class="text-xs font-medium text-sidebar-foreground/80 transition-colors group-hover:text-sidebar-foreground">
          Upgrade to Pro &rarr;
        </span>
      </a>
    </div>
  {/if}

  {#if subscription?.reason === 'past_due_grace'}
    <div class="px-3 pb-2">
      <a
        href="/bakeries/settings/billing"
        class="group block rounded-lg border border-red-200 bg-red-50 p-3 transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:hover:bg-red-950/50"
      >
        <div class="mb-1 flex items-center gap-2">
          <div class="flex size-6 items-center justify-center rounded-md bg-red-500/15 text-red-600 dark:text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
          </div>
          <span class="text-xs font-semibold text-red-700 dark:text-red-400">Payment Past Due</span>
        </div>
        <span class="text-[11px] text-red-600/80 transition-colors group-hover:text-red-700 dark:text-red-400/80 dark:group-hover:text-red-300">
          Update billing info &rarr;
        </span>
      </a>
    </div>
  {/if}

  {#if subscription?.cancelAtPeriodEnd && subscription?.reason === 'subscribed'}
    <div class="px-3 pb-2">
      <a
        href="/bakeries/settings/billing"
        class="group block rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3 transition-colors hover:bg-sidebar-accent/50"
      >
        <div class="mb-1 flex items-center gap-2">
          <div class="flex size-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
          </div>
          <span class="text-xs font-semibold text-sidebar-foreground">Canceling Soon</span>
        </div>
        <span class="text-[11px] text-sidebar-foreground/70 transition-colors group-hover:text-sidebar-foreground">
          Manage billing &rarr;
        </span>
      </a>
    </div>
  {/if}

  <Sidebar.Footer>
    {#if user}
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Sidebar.MenuButton
                  size="lg"
                  class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  {...props}
                >
                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground">
                    {(user.name || user.email || '?')[0].toUpperCase()}
                  </div>
                  <div class="grid flex-1 text-left text-sm leading-tight">
                    {#if user.name}
                      <span class="truncate font-medium">{user.name}</span>
                    {/if}
                    <span class="truncate text-xs">{user.email}</span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ms-auto size-4"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
                </Sidebar.MenuButton>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              class="min-w-56 rounded-lg"
              side={sidebar.isMobile ? 'bottom' : 'right'}
              align="end"
              sideOffset={4}
            >
              <DropdownMenu.Group>
                <DropdownMenu.Label class="p-0 font-normal">
                  <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground">
                      {(user.name || user.email || '?')[0].toUpperCase()}
                    </div>
                    <div class="grid flex-1 text-left text-sm leading-tight">
                      {#if user.name}
                        <span class="truncate font-medium">{user.name}</span>
                      {/if}
                      <span class="truncate text-xs">{user.email}</span>
                    </div>
                  </div>
                </DropdownMenu.Label>
              </DropdownMenu.Group>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onSelect={() => { window.location.href = '/settings' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /></svg>
                Account Settings
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => {
                const form = document.createElement('form')
                form.method = 'POST'
                form.action = '/logout'
                document.body.appendChild(form)
                form.submit()
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
                Log out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    {/if}
  </Sidebar.Footer>
</Sidebar.Sidebar>
