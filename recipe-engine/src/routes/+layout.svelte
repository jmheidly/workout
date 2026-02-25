<script>
  import '../app.css'
  import { Toaster } from 'svelte-sonner'

  let { children } = $props()
</script>

<svelte:head>
  <title>Recipe Engine</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  {@render children()}
</div>

<Toaster />
