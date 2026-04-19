const statusEl = document.getElementById('status')
const statsEl = document.getElementById('stats')
const runBtn = document.getElementById('runBtn')
const autoToggle = document.getElementById('autoToggle')

async function loadStatus() {
  const { autoEnabled, lastResult } = await chrome.storage.local.get(['autoEnabled', 'lastResult'])
  autoToggle.checked = autoEnabled !== false

  if (lastResult) {
    const when = new Date(lastResult.time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    statusEl.textContent = `Last run: ${when}`
    const t = lastResult.today || {}
    const y = lastResult.yday || {}
    statsEl.innerHTML = `
      <div class="row"><span>Today Views</span><b>${t.views ?? '—'}</b></div>
      <div class="row"><span>Today Orders</span><b>${t.orders ?? '—'}</b></div>
      <div class="row"><span>Today Revenue</span><b>$${t.revenue ?? 0}</b></div>
      <div class="row"><span>Yday Views</span><b>${y.views ?? '—'}</b></div>
      <div class="row"><span>Yday Orders</span><b>${y.orders ?? '—'}</b></div>
      <div class="row"><span>Yday Revenue</span><b>$${y.revenue ?? 0}</b></div>
    `
  } else {
    statusEl.textContent = 'Chưa chạy lần nào'
  }
}

runBtn.addEventListener('click', async () => {
  runBtn.disabled = true
  runBtn.textContent = 'Running...'
  chrome.runtime.sendMessage({ type: 'MANUAL_RUN' }, (res) => {
    setTimeout(() => {
      runBtn.disabled = false
      runBtn.textContent = 'Run now'
      loadStatus()
    }, 3000)
  })
})

autoToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ autoEnabled: autoToggle.checked })
})

loadStatus()
