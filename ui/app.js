const $ = (id) => document.getElementById(id);
let currentThread = null;
let historyItems = [];
const apiBase = () => $('apiUrl').value.trim().replace(/\/+$/, '');
const setBusy = (busy, label = 'Run refund agent') => {
  const button = $('submitBtn'); button.disabled = busy;
  button.innerHTML = busy ? '<span class="spinner">◌</span> Running agent…' : `<span>↗</span> ${label}`;
};
function showError(message) {
  $('errorBox').textContent = message;
  $('errorBox').classList.remove('hidden');
}
function clearError() { $('errorBox').classList.add('hidden'); $('errorBox').textContent = ''; }
function readable(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
  } catch {
    throw new Error(`Could not connect to ${apiBase()}. Start FastAPI and check the URL.`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status}).`);
  return data;
}
async function checkHealth() {
  const badge = $('apiBadge'); const text = $('apiText'); const value = $('healthValue');
  badge.className = 'api-badge checking'; text.textContent = 'Checking API…'; value.className = 'checking'; value.textContent = 'Checking';
  try {
    await request('/health');
    badge.className = 'api-badge online'; text.textContent = 'API Connected'; value.className = 'online'; value.textContent = 'Healthy';
  } catch {
    badge.className = 'api-badge offline'; text.textContent = 'API Offline'; value.className = 'offline'; value.textContent = 'Unavailable';
  }
}
function renderResult(data) {
  const box = $('resultBox'); box.classList.remove('hidden');
  const pending = data.status === 'awaiting_approval';
  box.className = `result ${pending ? 'pending-result' : 'done-result'}`;
  const interrupts = Array.isArray(data.interrupts) ? data.interrupts : [];
  box.innerHTML = `
    <div class="result-top"><div class="result-symbol ${pending ? 'pending' : 'done'}">${pending ? '◷' : '✓'}</div>
      <div class="result-copy"><b>${pending ? 'Human approval required' : 'Workflow completed'}</b><small>${pending ? 'Review the request before proceeding.' : 'The agent has finished processing this request.'}</small></div>
      <span class="pill ${pending ? 'pending' : 'done'}">${pending ? 'Pending review' : 'Completed'}</span></div>
    <div class="thread-row"><span>THREAD ID</span><code></code><button type="button" id="copyThread">Copy</button></div>
    ${data.decision != null ? `<div class="detail-row"><span>Decision</span><b></b></div>` : ''}
    ${data.response ? `<div class="agent-response"><span>AGENT RESPONSE</span><p></p></div>` : ''}
    ${pending && interrupts.length ? `<div class="interrupt-box"><strong>◷ Review details</strong>${interrupts.map(() => '<p></p>').join('')}</div>` : ''}
    ${pending ? '<div class="review-actions"><button type="button" class="reject" id="rejectBtn">× &nbsp; Reject refund</button><button type="button" class="approve" id="approveBtn">✓ &nbsp; Approve refund</button></div>' : '<div class="completed-note">✓ &nbsp; No further review is pending for this workflow.</div>'}`;
  box.querySelector('.thread-row code').textContent = data.thread_id || '';
  $('copyThread').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(data.thread_id || ''); $('copyThread').textContent = 'Copied'; }
    catch { $('copyThread').textContent = 'Select ID'; }
  });
  if (data.decision != null) box.querySelector('.detail-row b').textContent = readable(data.decision);
  if (data.response) box.querySelector('.agent-response p').textContent = readable(data.response);
  if (pending && interrupts.length) box.querySelectorAll('.interrupt-box p').forEach((p, i) => p.textContent = readable(interrupts[i]));
  if (pending) {
    $('approveBtn').addEventListener('click', () => submitReview(true));
    $('rejectBtn').addEventListener('click', () => submitReview(false));
  }
}
function updateHistory(data, message) {
  const found = historyItems.findIndex(item => item.thread_id === data.thread_id);
  const item = { ...data, message: message ?? historyItems[found]?.message ?? '', time: historyItems[found]?.time || new Date().toLocaleTimeString() };
  if (found >= 0) historyItems[found] = item; else historyItems.unshift(item);
  historyItems = historyItems.slice(0, 8);
  $('requestCount').textContent = historyItems.length;
  $('historyCount').textContent = `${historyItems.length} ${historyItems.length === 1 ? 'request' : 'requests'}`;
  const list = $('historyList'); list.className = 'history-list'; list.innerHTML = '';
  historyItems.forEach((entry) => {
    const row = document.createElement('button'); row.className = 'history-item'; row.type = 'button';
    const icon = document.createElement('div'); icon.className = 'history-icon'; icon.textContent = '▤';
    const main = document.createElement('div'); main.className = 'history-main';
    const title = document.createElement('strong'); title.textContent = entry.message || 'Refund request';
    const meta = document.createElement('span'); meta.textContent = `${entry.thread_id} · ${entry.time}`;
    main.append(title, meta);
    const pill = document.createElement('span'); pill.className = `pill ${entry.status === 'awaiting_approval' ? 'pending' : 'done'}`; pill.textContent = entry.status === 'awaiting_approval' ? 'Pending review' : 'Completed';
    const arrow = document.createElement('span'); arrow.className = 'history-arrow'; arrow.textContent = '↗';
    row.append(icon, main, pill, arrow);
    row.addEventListener('click', () => { currentThread = entry.thread_id; $('customerMessage').value = entry.message; renderResult(entry); $('new-request').scrollIntoView({behavior:'smooth'}); });
    list.appendChild(row);
  });
}
$('requestForm').addEventListener('submit', async (event) => {
  event.preventDefault(); clearError();
  const message = $('customerMessage').value.trim();
  if (!message) return showError('Please enter the customer’s refund issue.');
  currentThread = (globalThis.crypto?.randomUUID?.() || `thread-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  $('resultBox').classList.add('hidden'); setBusy(true);
  try {
    const data = await request('/support', { method: 'POST', body: JSON.stringify({ message, thread_id: currentThread }) });
    currentThread = data.thread_id; renderResult(data); updateHistory(data, message); checkHealth();
  } catch (err) { showError(err.message || 'Something went wrong.'); }
  finally { setBusy(false); }
});
async function submitReview(approved) {
  if (!currentThread) return showError('No request selected to review.');
  clearError(); const buttons = document.querySelectorAll('.review-actions button'); buttons.forEach(b => b.disabled = true);
  buttons[approved ? 1 : 0].textContent = 'Submitting…';
  try {
    const data = await request(`/review/${encodeURIComponent(currentThread)}`, { method: 'POST', body: JSON.stringify({ approved }) });
    renderResult(data); updateHistory(data); checkHealth();
  } catch (err) { showError(err.message || 'Review failed.'); buttons.forEach(b => b.disabled = false); buttons[approved ? 1 : 0].textContent = approved ? '✓  Approve refund' : '×  Reject refund'; }
}
$('refreshHealth').addEventListener('click', checkHealth);
$('refreshHealth2').addEventListener('click', checkHealth);
document.querySelectorAll('.sample').forEach(button => button.addEventListener('click', () => { $('customerMessage').value = button.dataset.message; $('customerMessage').focus(); }));
$('apiUrl').addEventListener('change', checkHealth);
checkHealth();
