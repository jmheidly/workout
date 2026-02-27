<script>
  import { page } from '$app/stores'
</script>

<div class="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
  <h1 class="text-4xl font-bold">{$page.status}</h1>
  <p class="mt-2 text-muted-foreground">
    {#if $page.status === 404}
      The page you're looking for doesn't exist.
    {:else if $page.status === 403}
      You don't have permission to access this page.
    {:else}
      Something went wrong.
    {/if}
  </p>
  <a href="/recipes" class="mt-6 text-sm underline hover:text-foreground">
    Back to recipes
  </a>
</div>
