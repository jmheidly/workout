<script>
  import { formatGrams, formatPct } from '$lib/utils.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
  } from '$lib/components/ui/card/index.js'
  import { Badge } from '$lib/components/ui/badge/index.js'

  let { data } = $props()

  const DRIFT_THRESHOLD = 0.02
</script>

<div class="space-y-6">
  <h1 class="text-2xl font-bold">Production Dashboard</h1>

  {#if data.recentSessions.length === 0}
    <div class="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <p class="text-muted-foreground">No production sessions logged yet.</p>
      <p class="text-sm text-muted-foreground">
        Log batch sessions from individual recipe production pages.
      </p>
    </div>
  {:else}
    <!-- Drift Alerts -->
    {#if data.driftAlerts.length > 0}
      <Card class="border-amber-300">
        <CardHeader class="pb-4">
          <CardTitle class="flex items-center gap-2 text-amber-700">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            Loss Drift Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            {#each data.driftAlerts as alert}
              {@const processDiff = alert.avg_process_loss_pct != null ? alert.avg_process_loss_pct - (alert.recipe_process_loss_pct || 0) : null}
              {@const bakeDiff = alert.avg_bake_loss_pct != null ? alert.avg_bake_loss_pct - (alert.recipe_bake_loss_pct || 0) : null}
              <div class="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2">
                <a href="/recipes/{alert.recipe_id}/production" class="text-sm font-medium hover:underline">
                  {alert.recipe_name}
                </a>
                {#if processDiff != null && Math.abs(processDiff) >= DRIFT_THRESHOLD}
                  <Badge variant="secondary" class="font-normal text-[10px] {processDiff > 0 ? 'border-red-300 bg-red-50 text-red-700' : 'border-blue-300 bg-blue-50 text-blue-700'}">
                    Process: {processDiff > 0 ? '+' : ''}{(processDiff * 100).toFixed(1)}pp
                  </Badge>
                {/if}
                {#if bakeDiff != null && Math.abs(bakeDiff) >= DRIFT_THRESHOLD}
                  <Badge variant="secondary" class="font-normal text-[10px] {bakeDiff > 0 ? 'border-red-300 bg-red-50 text-red-700' : 'border-blue-300 bg-blue-50 text-blue-700'}">
                    Bake: {bakeDiff > 0 ? '+' : ''}{(bakeDiff * 100).toFixed(1)}pp
                  </Badge>
                {/if}
              </div>
            {/each}
          </div>
        </CardContent>
      </Card>
    {/if}

    <!-- Rolling Averages by Recipe -->
    {#if data.recipeAverages.length > 0}
      <Card>
        <CardHeader class="pb-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <CardTitle class="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              Rolling Averages by Recipe
            </CardTitle>
            <Badge variant="secondary" class="font-normal">
              Last {data.rollingWindow} sessions
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div class="overflow-x-auto rounded-lg border border-border">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                  <th class="px-3 py-2 font-medium">Recipe</th>
                  <th class="px-3 py-2 font-medium text-right">Recipe Proc</th>
                  <th class="px-3 py-2 font-medium text-right">Avg Proc</th>
                  <th class="px-3 py-2 font-medium text-right">Recipe Bake</th>
                  <th class="px-3 py-2 font-medium text-right">Avg Bake</th>
                  <th class="px-3 py-2 font-medium text-right">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {#each data.recipeAverages as r}
                  <tr class="border-b border-border last:border-b-0">
                    <td class="px-3 py-1.5">
                      <a href="/recipes/{r.recipe_id}/production" class="font-medium hover:underline">{r.recipe_name}</a>
                    </td>
                    <td class="px-3 py-1.5 text-right tabular-nums">{formatPct(r.recipe_process_loss_pct || 0)}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums">
                      {r.avg_process_loss_pct != null ? formatPct(r.avg_process_loss_pct) : '—'}
                    </td>
                    <td class="px-3 py-1.5 text-right tabular-nums">{formatPct(r.recipe_bake_loss_pct || 0)}</td>
                    <td class="px-3 py-1.5 text-right tabular-nums">
                      {r.avg_bake_loss_pct != null ? formatPct(r.avg_bake_loss_pct) : '—'}
                    </td>
                    <td class="px-3 py-1.5 text-right tabular-nums">
                      {Math.max(r.process_session_count || 0, r.bake_session_count || 0)}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    {/if}

    <!-- Recent Sessions -->
    <Card>
      <CardHeader class="pb-4">
        <CardTitle class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Recent Sessions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto rounded-lg border border-border">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th class="px-3 py-2 font-medium">Date</th>
                <th class="px-3 py-2 font-medium">Recipe</th>
                <th class="px-3 py-2 font-medium text-right">Dough Off</th>
                <th class="px-3 py-2 font-medium text-right">Proc Loss</th>
                <th class="px-3 py-2 font-medium text-right">Bake Loss</th>
                <th class="px-3 py-2 font-medium text-right">Scale</th>
                <th class="px-3 py-2 font-medium">Logged By</th>
              </tr>
            </thead>
            <tbody>
              {#each data.recentSessions as session}
                <tr class="border-b border-border last:border-b-0">
                  <td class="px-3 py-1.5 tabular-nums">{session.session_date}</td>
                  <td class="px-3 py-1.5">
                    <a href="/recipes/{session.recipe_id}/production" class="font-medium hover:underline">{session.recipe_name}</a>
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">
                    {session.dough_weight_off_mixer != null ? formatGrams(session.dough_weight_off_mixer) : '—'}
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">
                    {session.actual_process_loss_pct != null ? formatPct(session.actual_process_loss_pct) : '—'}
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">
                    {session.actual_bake_loss_pct != null ? formatPct(session.actual_bake_loss_pct) : '—'}
                  </td>
                  <td class="px-3 py-1.5 text-right tabular-nums">{session.scale_factor.toFixed(2)}x</td>
                  <td class="px-3 py-1.5 text-muted-foreground">{session.created_by_name || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  {/if}
</div>
