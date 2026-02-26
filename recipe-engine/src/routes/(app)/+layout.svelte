<script>
  import { page } from '$app/stores'
  import AppSidebar from '$lib/components/app-sidebar.svelte'
  import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js'
  import { Separator } from '$lib/components/ui/separator/index.js'
  import * as Sidebar from '$lib/components/ui/sidebar/index.js'

  let { data, children } = $props()

  const routeLabels = {
    recipes: 'Recipes',
    production: 'Production',
    inventory: 'Inventory',
    reports: 'Reports',
    mixers: 'Mixers',
    settings: 'Settings',
    bakeries: 'Bakery',
    members: 'Members',
  }

  function resolveLabel(seg, segments, index) {
    if (routeLabels[seg]) return routeLabels[seg]
    // Recipe detail page: /recipes/[id]
    if (index === 1 && segments[0] === 'recipes' && $page.data.recipe?.name) {
      return $page.data.recipe.name
    }
    // Sub-pages under recipe: /recipes/[id]/production
    if (index === 2 && segments[0] === 'recipes') {
      return routeLabels[seg] || decodeURIComponent(seg)
    }
    return decodeURIComponent(seg)
  }

  let breadcrumbs = $derived.by(() => {
    const path = $page.url.pathname
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) return []

    const crumbs = []
    let href = ''
    for (let i = 0; i < segments.length; i++) {
      href += '/' + segments[i]
      crumbs.push({
        label: resolveLabel(segments[i], segments, i),
        href,
      })
    }
    return crumbs
  })
</script>

<Sidebar.Provider>
  <AppSidebar user={data.user} bakery={data.bakery} />
  <Sidebar.Inset>
    <header
      class="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
    >
      <div class="flex items-center gap-2 px-4">
        <Sidebar.Trigger class="-ms-1" />
        <Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb.Root>
          <Breadcrumb.List>
            {#each breadcrumbs as crumb, i}
              {#if i > 0}
                <Breadcrumb.Separator class="hidden md:block" />
              {/if}
              <Breadcrumb.Item class={i < breadcrumbs.length - 1 ? 'hidden md:block' : ''}>
                {#if i < breadcrumbs.length - 1}
                  <Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
                {:else}
                  <Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
                {/if}
              </Breadcrumb.Item>
            {/each}
          </Breadcrumb.List>
        </Breadcrumb.Root>
      </div>
    </header>
    <div class="flex flex-1 flex-col gap-4 p-4 pt-0">
      {@render children()}
    </div>
  </Sidebar.Inset>
</Sidebar.Provider>
