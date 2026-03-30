// ── CONFIG ──
const runtimeConfig = window.__APP_CONFIG__ || {};
const API_URL = runtimeConfig.API_URL || 'https://script.google.com/macros/s/AKfycbx42K24D_ez7674ufMdXRbgb2lvRanEfXcmZryS3EFHy6Ffz_RELIfrMc2Dws02_ErWVw/exec';
const CACHE_KEY = runtimeConfig.CACHE_KEY || 'finanzas_maicol_cache_v2';

// ── STATE ──
function getDefaultState() {
  return {
    gastos: [],
    deudas: {
      rappi: { saldoInicial: 1963652, saldoActual: 1963652, pagos: [] },
      fin:   { saldoInicial: 11529267, saldoActual: 11529267, pagos: [] }
    },
    pareja: {
      items: [
        { id:1,  nombre:'Cuota apartamento',     valor: 0 },
        { id:2,  nombre:'Mercado',               valor: 800000 },
        { id:3,  nombre:'Agua',                  valor: 57090 },
        { id:4,  nombre:'Luz',                   valor: 120000 },
        { id:5,  nombre:'Gas',                   valor: 30000 },
        { id:6,  nombre:'Internet',              valor: 77000 },
        { id:7,  nombre:'Parqueadero',           valor: 200000 },
        { id:8,  nombre:'Arriendo',              valor: 1300000 },
        { id:9,  nombre:'Comidas',               valor: 250000 },
        { id:10, nombre:'Salidas',               valor: 250000 },
        { id:11, nombre:'Gasolina',              valor: 90000 },
        { id:12, nombre:'Tarjetas (curechlos)',  valor: 1466667 },
        { id:13, nombre:'Seguro gatos',          valor: 39500 },
        { id:14, nombre:'Aseo',                  valor: 120000 },
        { id:15, nombre:'Gym',                   valor: 220000 },
      ],
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
    if (raw) { state = JSON.parse(raw); return true; }
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
  };
  const s = map[status] || map.ok;
  el.textContent = s.text;
  el.style.color = s.color;
}

// ── API CALLS ──
async function apiCall(payload) {
  setSyncStatus('saving');
  try {
    const resp = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }
    });
    const data = await resp.json();
    setSyncStatus('ok');
    return data;
  } catch(e) {
    setSyncStatus('error');
    return null;
  }
}

async function loadFromSheets() {
  setSyncStatus('loading');
  try {
    const resp = await fetch(API_URL + '?action=loadAll');
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    // Gastos
    state.gastos = (data.gastos || []).map(g => ({
      ...g, monto: parseFloat(g.monto) || 0
    })).sort((a,b) => b.fecha.localeCompare(a.fecha));

    // Deudas
    if (data.deudas) {
      state.deudas.rappi.saldoActual = parseFloat(data.deudas.rappi?.saldoActual) || 1963652;
      state.deudas.fin.saldoActual   = parseFloat(data.deudas.fin?.saldoActual)   || 11529267;
    }

    // Pagos deuda
    const pagosDeuda = data.pagosDeuda || [];
    state.deudas.rappi.pagos = pagosDeuda.filter(p => p.tarjeta === 'rappi').map(p => ({ fecha: p.fecha, monto: parseFloat(p.monto)||0 }));
    state.deudas.fin.pagos   = pagosDeuda.filter(p => p.tarjeta === 'fin').map(p => ({ fecha: p.fecha, monto: parseFloat(p.monto)||0 }));

    // Ahorro
    state.ahorro.depositos = (data.ahorro || []).map(d => ({ ...d, monto: parseFloat(d.monto)||0 }));

    // Pareja
    if (data.pareja && data.pareja.length > 0) {
      state.pareja.items = data.pareja.map(p => ({ ...p, valor: parseFloat(p.valor)||0 }));
    }

    saveCache();
    setSyncStatus('ok');
  } catch(e) {
    setSyncStatus('error');
    loadCache();
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
  const dt = new Date(d + 'T12:00:00');
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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.top-nav button, .bottom-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  // Activar todos los botones con el mismo destino (top + bottom nav)
  document.querySelectorAll('.top-nav button, .bottom-nav button').forEach(b => {
    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'"+id+"'")) {
      b.classList.add('active');
    }
  });
  if (id === 'dashboard') renderDashboard();
  if (id === 'gastos') renderGastos();
  if (id === 'deudas') renderDeudas();
  if (id === 'pareja') renderPareja();
  if (id === 'ahorro') renderAhorro();
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
  const mesFilter = document.getElementById('filtro-mes').value;
  const catFilter = document.getElementById('filtro-cat').value;
  const metodoFilter = document.getElementById('filtro-metodo').value;

  // populate mes filter
  const meses = [...new Set(state.gastos.map(g => mesKey(g.fecha)))].sort().reverse();
  const mesSelect = document.getElementById('filtro-mes');
  const currentMes = mesSelect.value;
  mesSelect.innerHTML = '<option value="all">Todos los meses</option>' + meses.map(m => `<option value="${m}" ${m === currentMes ? 'selected':''}>${mesLabel(m)}</option>`).join('');

  let filtered = state.gastos;
  if (mesFilter !== 'all') filtered = filtered.filter(g => mesKey(g.fecha) === mesFilter);
  if (catFilter !== 'all') filtered = filtered.filter(g => g.cat === catFilter);
  if (metodoFilter !== 'all') filtered = filtered.filter(g => g.metodo === metodoFilter);

  const tbody = document.getElementById('gastos-body');
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
  const now = new Date();
  document.getElementById('dash-date').textContent = now.toLocaleDateString('es-CO', {weekday:'long', year:'numeric', month:'long', day:'numeric'});

  const currentMes = now.toISOString().slice(0,7);
  document.getElementById('dash-mes-label').textContent = mesLabel(currentMes);

  const gastosMes = state.gastos.filter(g => mesKey(g.fecha) === currentMes);
  const totalMes = gastosMes.reduce((s,g) => s+g.monto, 0);

  const totalDeuda = state.deudas.rappi.saldoActual + state.deudas.fin.saldoActual;
  const totalAhorro = state.ahorro.depositos.reduce((s,d) => s+d.monto, 0);

  document.getElementById('dm-deuda').textContent = fmt(totalDeuda);
  document.getElementById('dm-gastado').textContent = fmt(totalMes);
  document.getElementById('dm-ahorro').textContent = fmt(totalAhorro);

  // Últimos gastos (5)
  const tbody = document.getElementById('dash-gastos-body');
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
  const catDiv = document.getElementById('cat-summary');
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
  const meta = parseFloat(document.getElementById('meta-viaje').value) || 1200000;
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
  const meta = parseFloat(document.getElementById('meta-viaje').value) || 1200000;
  const mensual = parseFloat(document.getElementById('ahorro-mensual-plan').value) || 150000;
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

  document.getElementById('proyeccion-table').innerHTML = `
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
  document.getElementById('g-fecha').value = todayStr();

  // Mostrar caché inmediatamente mientras carga Sheets
  loadCache();
  renderDashboard();

  // Luego cargar desde Sheets y re-renderizar
  await loadFromSheets();
  renderDashboard();

  const mesSelect = document.getElementById('filtro-mes');
  const currentMes = new Date().toISOString().slice(0,7);
  mesSelect.innerHTML = `<option value="all">Todos los meses</option><option value="${currentMes}" selected>${mesLabel(currentMes)}</option>`;
});
