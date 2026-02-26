<script>
  import { cn } from '$lib/utils.js'
  import { Combobox } from 'bits-ui'

  let {
    mixerProfiles = [],
    value = $bindable(''),
    onCreateNew = () => {},
  } = $props()

  let inputValue = $state('')
  let open = $state(false)

  let filtered = $derived.by(() => {
    const q = inputValue.toLowerCase().trim()
    const items = [
      { value: '', label: 'None', type: '' },
      ...mixerProfiles.map((mp) => ({
        value: mp.id,
        label: mp.name,
        type: mp.type,
      })),
    ]
    if (!q) return items
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.type.toLowerCase().includes(q)
    )
  })

  let displayLabel = $derived.by(() => {
    if (!value) return 'None'
    const mp = mixerProfiles.find((m) => m.id === value)
    return mp ? mp.name : 'Unknown'
  })

  function handleCreateNew() {
    open = false
    inputValue = ''
    onCreateNew()
  }
</script>

<Combobox.Root
  type="single"
  bind:value
  bind:open
  items={filtered}
  onOpenChange={(isOpen) => {
    if (!isOpen) inputValue = ''
  }}
>
  <div class="relative">
    <Combobox.Input
      placeholder="Search mixers..."
      defaultValue={displayLabel}
      oninput={(e) => {
        inputValue = e.currentTarget.value
      }}
      onclick={() => { open = true }}
      class="flex h-9 w-full items-center rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-ring transition-shadow placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
    />
    <Combobox.Trigger class="absolute right-0 top-0 flex h-9 w-8 items-center justify-center text-muted-foreground">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 opacity-50"><path d="m6 9 6 6 6-6"/></svg>
    </Combobox.Trigger>
  </div>

  <Combobox.Portal>
    <Combobox.Content
      class="relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
      sideOffset={4}
    >
      <Combobox.Viewport class="p-1">
        {#each filtered as item (item.value)}
          <Combobox.Item
            value={item.value}
            label={item.label}
            class="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
          >
            {#snippet children({ selected })}
              <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {#if selected}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                {/if}
              </span>
              <span>
                {item.label}
                {#if item.type}
                  <span class="ml-1 text-xs text-muted-foreground">({item.type})</span>
                {/if}
              </span>
            {/snippet}
          </Combobox.Item>
        {:else}
          <div class="py-2 text-center text-sm text-muted-foreground">No mixers found.</div>
        {/each}

        <!-- Separator + Create action -->
        <div class="mx-1 my-1 h-px bg-border"></div>
        <button
          type="button"
          onclick={handleCreateNew}
          class="flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary outline-none hover:bg-accent"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          New Mixer...
        </button>
      </Combobox.Viewport>
    </Combobox.Content>
  </Combobox.Portal>
</Combobox.Root>
