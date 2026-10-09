/* Nome e Local do Ficheiro: js/state.js */

/* ============================================================
   ESTADO DO APP
   Variáveis que guardam os dados em memória enquanto o app
   está aberto. Mudam durante o uso (perfil ativo, partida
   em edição, gráficos instanciados, ordenação, etc).
   ============================================================ */
let state = { activeProfileId: null, profiles: [] };
let activeProfileId = null;
let editingMatchId = null;
let charts = {};
let logSort = { col: 'date', dir: 'desc' };
let mapSort = { col: 'kd', dir: 'desc' };
let mapTableVisible = localStorage.getItem("gt_mapTableVisible") !== "false";
let evolutionTab = "kd";
let recordDotsVisible = localStorage.getItem('gt_recordDots') !== 'false';
let mapRankVisible = localStorage.getItem('gt_mapRankVisible') !== 'false';
let dashboardMetricTab = null;
let selectedMatchIds = new Set();
let bulkActionBusy = false;

/* === FILTRO GLOBAL DO DASHBOARD === */
const DASH_PRESETS = [10, 30, 90, null]; // null = Total
let dashboardRecords = 30;
let dashboardSince = null;
let dashboardMapFilter = "";

function getDashboardMatches(profile) {
  if (!profile || !Array.isArray(profile.matches)) return [];
  let matches = [...profile.matches];
  if (dashboardMapFilter) {
    matches = matches.filter(m => m.map === dashboardMapFilter);
  }
  if (dashboardSince) {
    const sinceTime = new Date(dashboardSince + 'T00:00:00').getTime();
    matches = matches.filter(m => {
      const t = m.match_date ? new Date(m.match_date).getTime() : 0;
      return t >= sinceTime;
    });
  } else if (dashboardRecords !== null) {
    matches = matches.slice(-dashboardRecords);
  }
  return matches;
}

function getMapPerformanceMatches(profile) {
  if (!profile || !Array.isArray(profile.matches)) return [];
  let matches = [...profile.matches];
  
  if (dashboardSince) {
    const sinceTime = new Date(dashboardSince + 'T00:00:00').getTime();
    matches = matches.filter(m => {
      const t = m.match_date ? new Date(m.match_date).getTime() : 0;
      return t >= sinceTime;
    });
    return matches;
  }
  
  if (dashboardRecords !== null) {
    const mapGroups = {};
    matches.forEach(m => {
      if (!mapGroups[m.map]) mapGroups[m.map] = [];
      mapGroups[m.map].push(m);
    });
    const result = [];
    Object.values(mapGroups).forEach(mapMatches => {
      result.push(...mapMatches.slice(-dashboardRecords));
    });
    return result;
  }
  
  return matches;
}
let activeFilterPopover = null;

function openFilterPopover(type, anchorEl) {
  closeFilterPopover();
  let popover = document.getElementById('filter-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'filter-popover';
    document.body.appendChild(popover);
  }
  const profile = getActiveProfile();
  popover.innerHTML = renderFilterPopoverContent(type, profile);
  popover.classList.add('open');
  const rect = anchorEl.getBoundingClientRect();
  popover.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  popover.style.left = (rect.left + window.scrollX) + 'px';
  activeFilterPopover = type;
  setTimeout(() => {
    document.addEventListener('click', closeFilterPopoverOutside, { once: true });
  }, 0);
}

function closeFilterPopoverOutside(e) {
  const popover = document.getElementById('filter-popover');
  if (popover && !popover.contains(e.target) && !e.target.closest('.filter-pill')) {
    closeFilterPopover();
  }
}

function closeFilterPopover() {
  const popover = document.getElementById('filter-popover');
  if (popover) popover.classList.remove('open');
  activeFilterPopover = null;
}

function renderFilterPopoverContent(type, profile) {
  if (type === 'recorte') {
    const presets = [10, 30, 90, null];
    let html = `<div class="filter-popover-title">Filtrar por Partidas</div>`;
    presets.forEach(p => {
      const label = p === null ? 'Todas as partidas' : `Últimas ${p} partidas`;
      const isActive = !dashboardSince && dashboardRecords === p;
      html += `<button class="filter-popover-opt${isActive ? ' active' : ''}" onclick="applyRecordsFilter(${p === null ? 'null' : p});closeFilterPopover()">${label}</button>`;
    });
    html += `<div class="filter-popover-title" style="margin-top:12px;">Filtrar por período</div>`;
    html += `<input type="date" class="filter-popover-date" id="pop-date" value="${dashboardSince || ''}" onkeydown="if(event.key==='Enter'){applyDateFilter(document.getElementById('pop-date').value);closeFilterPopover();}">`;
    html += `<div class="filter-popover-actions">`;
    html += `<button class="filter-popover-btn" onclick="applyDateFilter(document.getElementById('pop-date').value);closeFilterPopover()">Aplicar</button>`;
    if (dashboardSince) {
      html += `<button class="filter-popover-btn secondary" onclick="applyDateFilter('');closeFilterPopover()">Limpar</button>`;
    }
    html += `</div>`;
    return html;
  }
  if (type === 'mapa') {
    let html = `<div class="filter-popover-title">Mapa</div>`;
    html += `<button class="filter-popover-opt${!dashboardMapFilter ? ' active' : ''}" onclick="setDashboardMapFilter('');closeFilterPopover()">Todos os mapas</button>`;
    if (profile && profile.maps) {
      profile.maps.forEach(m => {
        html += `<button class="filter-popover-opt${dashboardMapFilter === m ? ' active' : ''}" onclick="setDashboardMapFilter('${m}');closeFilterPopover()">${m}</button>`;
      });
    }
    return html;
  }
  return '';
}

function applyRecordsFilter(count) {
  dashboardRecords = count;
  dashboardSince = null;
  const label = count === null ? 'Todas as partidas' : `Últimas ${count} partidas`;
  showToast(`📊 ${label}`);
  renderDashboard();
}

function applyDateFilter(val) {
  if (val) {
    dashboardSince = val;
    const days = Math.ceil((new Date() - new Date(val + 'T00:00:00')) / (1000 * 60 * 60 * 24));
    showToast(`📅 Mostrando resultados dos últimos ${days} dia(s)`);
  } else {
    dashboardSince = null;
    showToast(`📅 Filtro de período removido`);
  }
  renderDashboard();
}

function resetDashboardFilters() {
  dashboardRecords = 30;
  dashboardSince = null;
  dashboardMapFilter = "";
  showToast(`↺ Filtros resetados`);
  renderDashboard();
  renderLog();
}

function setDashboardMapFilter(mapName) {
  dashboardMapFilter = mapName;
  const label = mapName || 'Todos os mapas';
  showToast(`🗺 ${label}`);
  renderDashboard();
  renderLog();
}

let mapGoalVisible = true;

function getMapGoalValue(metricId, profileId) {
  if (!metricId || !profileId) return null;
  const key = `goal_${metricId}_${profileId}`;
  const val = localStorage.getItem(key);
  const parsed = parseFloat(val);
  return isNaN(parsed) || parsed <= 0 ? null : parsed;
}

