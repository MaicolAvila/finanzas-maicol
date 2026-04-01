// ── CONFIG ──
const runtimeConfig = window.__APP_CONFIG__ || {};
const API_URL = runtimeConfig.API_URL || 'https://script.google.com/macros/s/AKfycbx42K24D_ez7674ufMdXRbgb2lvRanEfXcmZryS3EFHy6Ffz_RELIfrMc2Dws02_ErWVw/exec';
const CACHE_KEY = runtimeConfig.CACHE_KEY || 'finanzas_maicol_cache_v2';
const REQUEST_TIMEOUT_MS = 12000;
const PULL_TO_REFRESH_THRESHOLD = 72;

// ── STATE ──
function getDefaultState() {
  return {
    gastos: [],
    deudas: {
      rappi: { saldoInicial: 1963652, saldoActual: 0, pagos: [] },
      fin:   { saldoInicial: 11529267, saldoActual: 0, pagos: [] }
    },
    pareja: {
      items: [],
      kata: []
    },
    ahorro: { meta: 1200000, depositos: [] }
  };
}

let state = getDefaultState();

// ── CACHE (localStorage como respaldo offline) ──
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch(e) {}
}
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      state = {
        ...getDefaultState(),
        ...JSON.parse(raw)
      };
      return true;
    }
  } catch(e) {}
  return false;
}

// ── SYNC INDICATOR ──
function setSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const map = {
    loading: { text: '⟳ sincronizando...', color: 'var(--text3)' },
    ok:      { text: '✓ guardado en Sheets', color: 'var(--accent)' },
    error:   { text: '✗ sin conexión (guardado local)', color: 'var(--warn)' },
    saving:  { text: '↑ guardando...', color: 'var(--accent2)' },
    refresh: { text: '⟳ actualizando...', color: 'var(--accent2)' },
  };
  const s = map[status] || map.ok;
  el.textContent = s.text;
  el.style.color = s.color;
}

// ── API CALLS ──
function normalizeDateValue(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString().slice(0, 10);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      cache: 'no-store',
      ...options,
      signal: controller.signal
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    return await resp.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function apiCall(payload) {
  setSyncStatus('saving');
  try {
    const data = await fetchJson(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }
    });
    setSyncStatus('ok');
    return data;
  } catch(e) {
    setSyncStatus('error');
    return null;
  }
}

function hydrateStateFromSheets(data) {
  const nextState = getDefaultState();
  nextState.ahorro.meta = state.ahorro.meta || nextState.ahorro.meta;
  nextState.pareja.kata = Array.isArray(state.pareja?.kata) ? state.pareja.kata : [];

  nextState.gastos = (data.gastos || []).map((g) => ({
    ...g,
    fecha: normalizeDateValue(g.fecha),
    monto: parseFloat(g.monto) || 0
  })).sort((a, b) => b.fecha.localeCompare(a.fecha));

  nextState.deudas.rappi.saldoActual = parseFloat(data.deudas?.rappi?.saldoActual) || 0;
  nextState.deudas.fin.saldoActual = parseFloat(data.deudas?.fin?.saldoActual) || 0;

  const pagosDeuda = data.pagosDeuda || [];
  nextState.deudas.rappi.pagos = pagosDeuda
    .filter((p) => p.tarjeta === 'rappi')
    .map((p) => ({ fecha: normalizeDateValue(p.fecha), monto: parseFloat(p.monto) || 0 }));
  nextState.deudas.fin.pagos = pagosDeuda
    .filter((p) => p.tarjeta === 'fin')
    .map((p) => ({ fecha: normalizeDateValue(p.fecha), monto: parseFloat(p.monto) || 0 }));

  nextState.ahorro.depositos = (data.ahorro || []).map((d) => ({
    ...d,
    fecha: normalizeDateValue(d.fecha),
    monto: parseFloat(d.monto) || 0
  }));

  nextState.pareja.items = (data.pareja || []).map((p) => ({
    ...p,
    valor: parseFloat(p.valor) || 0
  }));

  state = nextState;
}

function refreshUI() {
  renderDashboard();
  renderGastos();
  renderDeudas();
  renderPareja();
  renderAhorro();
}

async function loadFromSheets(status = 'loading') {
  setSyncStatus(status);
  try {
    const url = new URL(API_URL);
    url.searchParams.set('action', 'loadAll');
    url.searchParams.set('_ts', String(Date.now()));

    const data = await fetchJson(url.toString());
    if (data.error) throw new Error(data.error);
    hydrateStateFromSheets(data);
    saveCache();
    refreshUI();
    setSyncStatus('ok');
    return true;
  } catch(e) {
    setSyncStatus('error');
    if (loadCache()) refreshUI();
    return false;
  }
}

async function saveState() {
  saveCache();
}

// ── FORMAT ──
function fmt(n) {
  if (isNaN(n) || n === null) return '$0';
  return '$' + Math.round(n).toLocaleString('es-CO');
}
function fmtDate(d) {
  if (!d) return '';
  const normalized = normalizeDateValue(d);
  const dt = new Date(`${normalized}T12:00:00`);
  return dt.toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' });
}
function todayStr() {
  return new Date().toISOString().slice(0,10);
}
function mesKey(dateStr) {
  if (!dateStr) return '';
  return dateStr.slice(0,7);
}
function mesLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return months[parseInt(m)-1] + ' ' + y;
}

// ── CAT COLORS ──
const catColors = {
  'Mercado': '#80c8f0',
  'Ingredientes / diario': '#50a8d0',
  'Restaurantes / salidas': '#2888b0',
  'Transporte': '#c8f080',
  'Entretenimiento': '#f0c880',
  'Suscripciones': '#c880f0',
  'Ropa': '#f080c8',
  'Deporte': '#80f0c8',
  'Salud': '#f08080',
  'Hogar': '#f0a880',
  'Familia': '#f080a8',
  'Otros': '#9a9690'
};

// ── NAV ──
function showPage(id, btn) {
  const routes = {
    dashboard: '/',
    gastos: '/gastos/',
    deudas: '/deudas/',
    pareja: '/pareja/',
    ahorro: '/ahorro/'
  };
  const target = routes[id];
  if (target) window.location.href = target;
}

async function manualRefresh() {
  await loadFromSheets('refresh');
}

function setPullIndicator(distance = 0, isReady = false) {
  const el = document.getElementById('pull-indicator');
  if (!el) return;

  const visibleDistance = Math.max(0, Math.min(distance, 96));
  el.style.opacity = visibleDistance > 0 ? '1' : '0';
  el.style.transform = `translate(-50%, ${visibleDistance - 90}px)`;
  el.textContent = isReady ? 'Suelta para actualizar' : 'Desliza para actualizar';
}

function setupPullToRefresh() {
  let startY = 0;
  let pullDistance = 0;
  let isPulling = false;

  window.addEventListener('touchstart', (event) => {
    if (window.scrollY > 0 || event.touches.length !== 1) return;
    startY = event.touches[0].clientY;
    pullDistance = 0;
    isPulling = true;
  }, { passive: true });

  window.addEventListener('touchmove', (event) => {
    if (!isPulling) return;

    const deltaY = event.touches[0].clientY - startY;
    if (deltaY <= 0) {
      setPullIndicator(0, false);
      return;
    }

    pullDistance = Math.min(96, deltaY * 0.45);
    setPullIndicator(pullDistance, pullDistance >= PULL_TO_REFRESH_THRESHOLD);
    if (pullDistance > 8) event.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', async () => {
    if (!isPulling) return;

    const shouldRefresh = pullDistance >= PULL_TO_REFRESH_THRESHOLD;
    isPulling = false;
    pullDistance = 0;
    setPullIndicator(0, false);

    if (shouldRefresh) {
      await manualRefresh();
    }
  }, { passive: true });
}

// ── GASTOS ──
async function quickAdd() {
  const desc   = document.getElementById('qd-desc').value.trim();
  const monto  = parseFloat(document.getElementById('qd-monto').value);
  const cat    = document.getElementById('qd-cat').value;
  const metodo = document.getElementById('qd-metodo').value;
  if (!desc || !monto) return;
  const gasto = { id: Date.now(), desc, monto, cat, metodo, fecha: todayStr(), nota: '' };
  state.gastos.unshift(gasto);
  saveCache();
  document.getElementById('qd-desc').value = '';
  document.getElementById('qd-monto').value = '';
  renderDashboard();
  await apiCall({ action: 'saveGasto', ...gasto });
}

async function addGasto() {
  const desc   = document.getElementById('g-desc').value.trim();
  const monto  = parseFloat(document.getElementById('g-monto').value);
  const cat    = document.getElementById('g-cat').value;
  const metodo = document.getElementById('g-metodo').value;
  const fecha  = document.getElementById('g-fecha').value || todayStr();
  const nota   = document.getElementById('g-nota').value.trim();
  if (!desc || !monto) return;
  const gasto = { id: Date.now(), desc, monto, cat, metodo, fecha, nota };
  state.gastos.unshift(gasto);
  saveCache();
  document.getElementById('g-desc').value = '';
  document.getElementById('g-monto').value = '';
  document.getElementById('g-nota').value = '';
  renderGastos();
  await apiCall({ action: 'saveGasto', ...gasto });
}

async function deleteGasto(id) {
  state.gastos = state.gastos.filter(g => g.id !== id);
  saveCache();
  renderGastos();
  renderDashboard();
  await apiCall({ action: 'deleteGasto', id });
}

function renderGastos() {
  const mesSelect = document.getElementById('filtro-mes');
  const catSelect = document.getElementById('filtro-cat');
  const metodoSelect = document.getElementById('filtro-metodo');
  const tbody = document.getElementById('gastos-body');
  if (!mesSelect || !catSelect || !metodoSelect || !tbody) return;

  const mesFilter = mesSelect.value;
  const catFilter = catSelect.value;
  const metodoFilter = metodoSelect.value;

  // populate mes filter
  const meses = [...new Set(state.gastos.map(g => mesKey(g.fecha)))].sort().reverse();
  const currentMes = mesSelect.value;
  mesSelect.innerHTML = '<option value="all">Todos los meses</option>' + meses.map(m => `<option value="${m}" ${m === currentMes ? 'selected':''}>${mesLabel(m)}</option>`).join('');

  let filtered = state.gastos;
  if (mesFilter !== 'all') filtered = filtered.filter(g => mesKey(g.fecha) === mesFilter);
  if (catFilter !== 'all') filtered = filtered.filter(g => g.cat === catFilter);
  if (metodoFilter !== 'all') filtered = filtered.filter(g => g.metodo === metodoFilter);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px;">No hay gastos registrados</td></tr>';
  } else {
    tbody.innerHTML = filtered.map(g => `
      <tr>
        <td style="color:var(--text3)">${fmtDate(g.fecha)}</td>
        <td>${g.desc}</td>
        <td><span class="cat-dot" style="background:${catColors[g.cat]||'#666'}"></span>${g.cat}</td>
        <td class="hide-mobile"><span class="badge ${g.metodo==='Rappi'?'badge-red':g.metodo==='Finandina'?'badge-amber':g.metodo==='Débito'?'badge-blue':'badge-green'}">${g.metodo}</span></td>
        <td class="hide-mobile" style="color:var(--text3)">${g.nota||'—'}</td>
        <td style="text-align:right;font-weight:500">${fmt(g.monto)}</td>
        <td><button class="btn-danger" onclick="deleteGasto(${g.id})">✕</button></td>
      </tr>
    `).join('');
  }
  const total = filtered.reduce((s,g) => s + g.monto, 0);
  document.getElementById('gastos-count').textContent = filtered.length + ' gastos';
  document.getElementById('gastos-total-label').textContent = 'Total: ' + fmt(total);
}

function exportarCSV() {
  const headers = ['Fecha','Descripción','Categoría','Método','Nota','Monto'];
  const rows = state.gastos.map(g => [g.fecha, g.desc, g.cat, g.metodo, g.nota, g.monto]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'gastos_maicol.csv'; a.click();
}

// ── DASHBOARD ──
function renderDashboard() {
  const dashDate = document.getElementById('dash-date');
  const dashMesLabel = document.getElementById('dash-mes-label');
  const deudaEl = document.getElementById('dm-deuda');
  const gastadoEl = document.getElementById('dm-gastado');
  const ahorroEl = document.getElementById('dm-ahorro');
  const tbody = document.getElementById('dash-gastos-body');
  const catDiv = document.getElementById('cat-summary');
  if (!dashDate || !dashMesLabel || !deudaEl || !gastadoEl || !ahorroEl || !tbody || !catDiv) return;

  const now = new Date();
  dashDate.textContent = now.toLocaleDateString('es-CO', {weekday:'long', year:'numeric', month:'long', day:'numeric'});

  const currentMes = now.toISOString().slice(0,7);
  dashMesLabel.textContent = mesLabel(currentMes);

  const gastosMes = state.gastos.filter(g => mesKey(g.fecha) === currentMes);
  const totalMes = gastosMes.reduce((s,g) => s+g.monto, 0);

  const totalDeuda = state.deudas.rappi.saldoActual + state.deudas.fin.saldoActual;
  const totalAhorro = state.ahorro.depositos.reduce((s,d) => s+d.monto, 0);

  deudaEl.textContent = fmt(totalDeuda);
  gastadoEl.textContent = fmt(totalMes);
  ahorroEl.textContent = fmt(totalAhorro);

  // Últimos gastos (5)
  const recientes = state.gastos.slice(0, 8);
  if (recientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:20px;">Aún no hay gastos — registrá el primero arriba ↑</td></tr>';
  } else {
    tbody.innerHTML = recientes.map(g => `
      <tr>
        <td>${g.desc}</td>
        <td><span class="cat-dot" style="background:${catColors[g.cat]||'#666'}"></span>${g.cat}</td>
        <td><span class="badge ${g.metodo==='Rappi'?'badge-red':g.metodo==='Finandina'?'badge-amber':g.metodo==='Débito'?'badge-blue':'badge-green'}">${g.metodo}</span></td>
        <td style="text-align:right;font-weight:500">${fmt(g.monto)}</td>
        <td><button class="btn-danger" onclick="deleteGasto(${g.id})">✕</button></td>
      </tr>
    `).join('');
  }

  // Por categoría
  const catTotals = {};
  gastosMes.forEach(g => { catTotals[g.cat] = (catTotals[g.cat]||0) + g.monto; });
  const sorted = Object.entries(catTotals).sort((a,b) => b[1]-a[1]);
  if (sorted.length === 0) {
    catDiv.innerHTML = '<div style="color:var(--text3);text-align:center;padding:16px;font-size:12px;">Sin gastos este mes todavía</div>';
  } else {
    const max = sorted[0][1];
    catDiv.innerHTML = sorted.map(([cat, total]) => `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);">
        <span class="cat-dot" style="background:${catColors[cat]||'#666'}"></span>
        <span style="flex:1;font-size:13px;">${cat}</span>
        <div style="flex:2;background:var(--bg4);border-radius:3px;height:4px;overflow:hidden;">
          <div style="height:100%;border-radius:3px;background:${catColors[cat]||'#666'};width:${Math.round(total/max*100)}%;"></div>
        </div>
        <span style="font-weight:500;min-width:90px;text-align:right;">${fmt(total)}</span>
      </div>
    `).join('') + `<div style="display:flex;justify-content:space-between;padding:10px 0 0;font-size:13px;font-weight:500;border-top:1px solid var(--border);margin-top:4px;"><span style="color:var(--text2)">Total mes</span><span>${fmt(totalMes)}</span></div>`;
  }
}

// ── DEUDAS ──
async function registrarPagoDeuda(tipo) {
  const input = document.getElementById(tipo+'-pago-input');
  const monto = parseFloat(input.value);
  if (!monto || monto <= 0) return;
  const deuda = state.deudas[tipo];
  deuda.saldoActual = Math.max(0, deuda.saldoActual - monto);
  const pago = { id: Date.now(), fecha: todayStr(), monto };
  deuda.pagos.unshift(pago);
  saveCache();
  input.value = '';
  renderDeudas();
  await apiCall({ action: 'saveDeuda', tarjeta: tipo, saldo: deuda.saldoActual });
  await apiCall({ action: 'savePagoDeuda', tarjeta: tipo, ...pago });
}

function renderDeudas() {
  if (!document.getElementById('rappi-saldo-display')) return;

  const rappi = state.deudas.rappi;
  const fin = state.deudas.fin;

  // Rappi
  const rappiPct = Math.round((1 - rappi.saldoActual/rappi.saldoInicial)*100);
  document.getElementById('rappi-saldo-display').textContent = fmt(rappi.saldoActual);
  document.getElementById('rappi-saldo-row').textContent = fmt(rappi.saldoActual);
  document.getElementById('rappi-pct').textContent = rappiPct + '% pagado';
  document.getElementById('rappi-prog').style.width = rappiPct + '%';

  const rappiHistEl = document.getElementById('rappi-historial');
  if (rappi.pagos.length > 0) {
    rappiHistEl.innerHTML = '<div style="font-size:11px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">Pagos registrados</div>' +
      rappi.pagos.slice(0,5).map(p => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);"><span>${fmtDate(p.fecha)}</span><span style="color:var(--accent)">${fmt(p.monto)}</span></div>`).join('');
  }

  // Finandina
  const finPct = Math.round((1 - fin.saldoActual/fin.saldoInicial)*100);
  document.getElementById('fin-saldo-display').textContent = fmt(fin.saldoActual);
  document.getElementById('fin-saldo-row').textContent = fmt(fin.saldoActual);
  document.getElementById('fin-pct').textContent = finPct + '% pagado';
  document.getElementById('fin-prog').style.width = finPct + '%';

  // Meses restantes estimados Finandina
  const mesesRest = fin.saldoActual > 0 ? Math.ceil(fin.saldoActual / 1500000) : 0;
  document.getElementById('fin-meses-label').textContent = mesesRest + ' meses estimados';

  const finHistEl = document.getElementById('fin-historial');
  if (fin.pagos.length > 0) {
    finHistEl.innerHTML = '<div style="font-size:11px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">Pagos registrados</div>' +
      fin.pagos.slice(0,5).map(p => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);"><span>${fmtDate(p.fecha)}</span><span style="color:var(--warn)">${fmt(p.monto)}</span></div>`).join('');
  }

  // Totales
  const totalDeuda = rappi.saldoActual + fin.saldoActual;
  const totalPagado = [...rappi.pagos, ...fin.pagos].reduce((s,p) => s+p.monto, 0);
  document.getElementById('total-deuda-display').textContent = fmt(totalDeuda);
  document.getElementById('total-pagado-display').textContent = fmt(totalPagado);
}

// ── PAREJA ──
async function addGastoPareja() {
  const nombre = document.getElementById('p-gasto').value.trim();
  const valor  = parseFloat(document.getElementById('p-valor').value);
  if (!nombre || !valor) return;
  state.pareja.items.push({ id: Date.now(), nombre, valor });
  saveCache();
  document.getElementById('p-gasto').value = '';
  document.getElementById('p-valor').value = '';
  renderPareja();
  await apiCall({ action: 'savePareja', items: state.pareja.items });
}

async function deleteGastoPareja(id) {
  state.pareja.items = state.pareja.items.filter(i => i.id !== id);
  saveCache();
  renderPareja();
  await apiCall({ action: 'savePareja', items: state.pareja.items });
}

async function addGastoKata() {
  const nombre = document.getElementById('k-gasto').value.trim();
  const valor  = parseFloat(document.getElementById('k-valor').value);
  if (!nombre || !valor) return;
  state.pareja.kata.push({ id: Date.now(), nombre, valor });
  saveCache();
  document.getElementById('k-gasto').value = '';
  document.getElementById('k-valor').value = '';
  renderPareja();
}

async function deleteGastoKata(id) {
  state.pareja.kata = state.pareja.kata.filter(i => i.id !== id);
  saveCache();
  renderPareja();
}

function renderPareja() {
  if (!document.getElementById('total-pareja-label')) return;

  const items = state.pareja.items;
  const total = items.reduce((s,i) => s + (i.valor||0), 0);
  const maicol80 = total * 0.8;
  const kata20 = total * 0.2;

  document.getElementById('total-pareja-label').textContent = 'Total: ' + fmt(total);
  document.getElementById('maicol-restante').textContent = fmt(6200000 - maicol80);
  document.getElementById('kata-restante').textContent = fmt(2600000 - kata20);

  const tbody = document.getElementById('pareja-tbody');
  tbody.innerHTML = items.map(i => `
    <tr>
      <td>${i.nombre}</td>
      <td>${fmt(i.valor)}</td>
      <td style="color:var(--warn)">${fmt(i.valor*0.8)}</td>
      <td style="color:var(--accent2)">${fmt(i.valor*0.2)}</td>
      <td><button class="btn-danger" onclick="deleteGastoPareja(${i.id})">✕</button></td>
    </tr>
  `).join('') + `
    <tr style="font-weight:500;border-top:1px solid var(--border2);">
      <td>Total</td>
      <td>${fmt(total)}</td>
      <td style="color:var(--warn)">${fmt(maicol80)}</td>
      <td style="color:var(--accent2)">${fmt(kata20)}</td>
      <td></td>
    </tr>
  `;

  // Kata personal
  const kataTbody = document.getElementById('kata-tbody');
  const kataItems = state.pareja.kata;
  const kataTotal = kataItems.reduce((s,i) => s+(i.valor||0), 0) + kata20;
  kataTbody.innerHTML = [
    { id:'auto', nombre:'Su parte gastos compartidos (20%)', valor: kata20 },
    ...kataItems
  ].map(i => `
    <tr>
      <td>${i.nombre}</td>
      <td>${fmt(i.valor)}</td>
      <td>${i.id==='auto'?'<span class="tag">auto</span>':`<button class="btn-danger" onclick="deleteGastoKata(${i.id})">✕</button>`}</td>
    </tr>
  `).join('');

  const kataRestante = 2600000 - kataTotal;
  document.getElementById('kata-restante-calc').textContent = fmt(kataRestante);
  document.getElementById('kata-restante-calc').style.color = kataRestante >= 0 ? 'var(--accent)' : 'var(--danger)';
}

// ── AHORRO ──
async function depositarAhorro() {
  const monto = parseFloat(document.getElementById('ahorro-deposito').value);
  if (!monto || monto <= 0) return;
  const deposito = { id: Date.now(), fecha: todayStr(), desc: 'Depósito viaje', monto };
  state.ahorro.depositos.unshift(deposito);
  saveCache();
  document.getElementById('ahorro-deposito').value = '';
  renderAhorro();
  await apiCall({ action: 'saveAhorro', ...deposito });
}

function renderAhorro() {
  const metaInput = document.getElementById('meta-viaje');
  if (!metaInput) return;

  const meta = parseFloat(metaInput.value) || 1200000;
  state.ahorro.meta = meta;
  saveState();

  const totalAhorro = state.ahorro.depositos.reduce((s,d) => s+d.monto, 0);
  const pct = Math.min(100, Math.round(totalAhorro/meta*100));

  document.getElementById('ahorro-actual-display').textContent = fmt(totalAhorro);
  document.getElementById('ahorro-meta-display').textContent = fmt(meta);
  document.getElementById('ahorro-bar').style.width = pct + '%';
  document.getElementById('ahorro-pct-label').textContent = pct + '% alcanzado';

  const now = new Date();
  const noviembre = new Date(2026, 10, 1);
  const mesesRest = Math.max(0, Math.round((noviembre - now) / (1000*60*60*24*30)));
  document.getElementById('ahorro-meses-label').textContent = 'Faltan ~' + mesesRest + ' meses';

  renderProyeccion();

  // Historial
  const tbody = document.getElementById('ahorro-historial-body');
  if (state.ahorro.depositos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:20px;">Sin depósitos aún</td></tr>';
  } else {
    tbody.innerHTML = state.ahorro.depositos.map(d => `
      <tr>
        <td style="color:var(--text3)">${fmtDate(d.fecha)}</td>
        <td>${d.desc}</td>
        <td style="text-align:right;color:var(--accent);font-weight:500">${fmt(d.monto)}</td>
      </tr>
    `).join('');
  }
  document.getElementById('ahorro-total-label').textContent = 'Total ahorrado: ' + fmt(totalAhorro);
}

function renderProyeccion() {
  const metaInput = document.getElementById('meta-viaje');
  const mensualInput = document.getElementById('ahorro-mensual-plan');
  const table = document.getElementById('proyeccion-table');
  if (!metaInput || !mensualInput || !table) return;

  const meta = parseFloat(metaInput.value) || 1200000;
  const mensual = parseFloat(mensualInput.value) || 150000;
  const totalActual = state.ahorro.depositos.reduce((s,d) => s+d.monto, 0);
  const falta = Math.max(0, meta - totalActual);
  const mesesNecesarios = mensual > 0 ? Math.ceil(falta / mensual) : 99;

  const now = new Date();
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  let rows = '';
  let acum = totalActual;
  for (let i = 0; i < Math.min(mesesNecesarios + 1, 10); i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    acum += mensual;
    const ok = acum >= meta;
    rows += `<tr>
      <td>${meses[d.getMonth()]} ${d.getFullYear()}</td>
      <td>${fmt(mensual)}</td>
      <td style="font-weight:500;color:${ok?'var(--accent)':'var(--text2)'}">${fmt(Math.min(acum, meta))}</td>
      <td>${ok ? '<span class="badge badge-green">✓ Meta</span>' : fmt(meta - acum) + ' falta'}</td>
    </tr>`;
    if (ok) break;
  }

  table.innerHTML = `
    <table class="tbl">
      <thead><tr><th>Mes</th><th>Depósito</th><th>Acumulado</th><th>Estado</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:var(--r);font-size:12px;color:var(--text2);">
      Con <strong style="color:var(--accent)">${fmt(mensual)}/mes</strong>, alcanzás la meta en <strong style="color:var(--accent2)">${mesesNecesarios} meses</strong> 
      ${mesesNecesarios <= 7 ? '— <span style="color:var(--accent)">✓ llegas para noviembre</span>' : '— <span style="color:var(--danger)">necesitás ahorrar más por mes</span>'}
    </div>
  `;
}

// ── MODAL ──
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  const gastoFechaInput = document.getElementById('g-fecha');
  if (gastoFechaInput) gastoFechaInput.value = todayStr();
  document.getElementById('sync-status')?.addEventListener('click', manualRefresh);
  setupPullToRefresh();

  // Mostrar caché inmediatamente mientras carga Sheets
  loadCache();
  refreshUI();

  // Luego cargar desde Sheets y re-renderizar
  await loadFromSheets();

  const mesSelect = document.getElementById('filtro-mes');
  if (mesSelect) {
    const currentMes = new Date().toISOString().slice(0,7);
    mesSelect.innerHTML = `<option value="all">Todos los meses</option><option value="${currentMes}" selected>${mesLabel(currentMes)}</option>`;
  }
});
