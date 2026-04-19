import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants.js'

export async function upsertStats({ store_id, snapshot_date, period, views, visits, orders, revenue, views_delta_pct, visits_delta_pct, orders_delta_pct, revenue_delta_pct, source }) {
  const url = `${SUPABASE_URL}/rest/v1/store_stats_daily`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      store_id,
      snapshot_date,
      period,
      views,
      visits,
      orders,
      revenue,
      views_delta_pct,
      visits_delta_pct,
      orders_delta_pct,
      revenue_delta_pct,
      source,
      updated_at: new Date().toISOString(),
    }),
  })
  if (!res.ok) throw new Error(`Supabase upsert failed: ${res.status} ${await res.text()}`)
  return true
}
