/* Nome e Local do Ficheiro: js/records.js */

/* ============================================================
   RECORDES — cálculo, toast e tooltip
   ============================================================ */
function getRecords(matches, metrics) {
  const records = {};
  Object.keys(RECORD_METRICS).forEach(m => {
    if (!metrics.includes(m)) return;
    const vals = matches.map(r => r[m]).filter(v => v !== undefined && v !== null);
    if (!vals.length) return;
    const isInv = RECORD_METRICS[m];
    records[m] = isInv ? Math.min(...vals) : Math.max(...vals);
  });
  return records;
}

const RECORD_METRIC_LABELS = { kd: 'K/D', kpm: 'KPM', kills: 'Kills', kpd: 'KPD' };
let _recordToastTimer = null;

function checkNewRecords(prev, curr) {
  const newRecords = [];
  Object.keys(RECORD_METRIC_LABELS).forEach(m => {
    if (curr[m] === undefined) return;
    // Se não havia recorde anterior, é a primeira partida — sem toast
    if (prev[m] === undefined) return;
    const isInv = RECORD_METRICS[m];
    const isNew = isInv ? curr[m] < prev[m] : curr[m] > prev[m];
    if (isNew) newRecords.push({ m, val: curr[m] });
  });
  if (!newRecords.length) return;
  // Pega o mais importante (primeiro da lista)
  const best = newRecords[0];
  const label = RECORD_METRIC_LABELS[best.m];
  const rank = 0; // sempre é novo #1
  clearTimeout(_recordToastTimer);
  _recordToastTimer = setTimeout(() => {
    showRecordToast(`🏆 Novo recorde de ${label}: ${best.val}`, RECORD_MEDALS[rank].cls);
  }, 2600);
}

function showRecordToast(msg, cls) {
  const t = document.getElementById('toast');
  t.className = cls || '';
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._rtimer);
  t._rtimer = setTimeout(() => { t.style.display = 'none'; t.className = ''; }, 3200);
}

function handleRecordHover(e) {
  const chart = charts["evolution"];
  if (!chart || chart.getDatasetMeta(0).hidden) {
    hideRecordTooltip();
    return;
  }
  
  const canvas = e.target;
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  const area = chart.chartArea;
  const insideArea = mouseX >= area.left && mouseX <= area.right && mouseY >= area.top && mouseY <= area.bottom;

  let hitIndex = -1;
  let nearestDist = Infinity;
  if (insideArea) {
    chart.getDatasetMeta(0).data.forEach((point, i) => {
      const dist = Math.abs(mouseX - point.x);
      if (dist < nearestDist) {
        nearestDist = dist;
        hitIndex = i;
      }
    });
  }
  
  if (hitIndex !== -1) {
    const match = chart._matchesUsed[hitIndex];
    if (match) {
      let rank = null;
      if (chart.options.plugins.recordDots?.enabled && chart._recordDotsPositions) {
        const recordDot = chart._recordDotsPositions.find(d => d.index === hitIndex);
        if (recordDot) rank = recordDot.rank;
      }
      showRecordTooltip(e.clientX, e.clientY, match, rank);
      return;
    }
  }
  
  hideRecordTooltip();
  canvas.style.cursor = 'default';
}

function showRecordTooltip(clientX, clientY, match, rank) {
  const t = document.getElementById('record-tooltip');
  const medal = rank !== null ? RECORD_MEDALS[rank] : null;
  const profile = getActiveProfile();
  const metrics = profile.metrics;
  
  let html = medal
    ? `<div class="rt-header"><span class="rt-medal">${medal.label.split(' ')[0]}</span><span class="rt-title" style="color:${medal.color}">${medal.rank} — Partida #${match.match_number || match.id}</span></div>`
    : `<div class="rt-header"><span class="rt-title">Partida #${match.match_number || match.id}</span></div>`;
  
  html += `<div class="rt-row"><span class="rt-label">Mapa</span><span class="rt-val">${match.map || '—'}</span></div>`;
  
  if (metrics.includes('kills')) {
    html += `<div class="rt-row"><span class="rt-label">Kills</span><span class="rt-val" style="color:var(--metric-kills)">${match.kills !== undefined ? match.kills : '—'}</span></div>`;
  }
  if (metrics.includes('deaths')) {
    html += `<div class="rt-row"><span class="rt-label">Deaths</span><span class="rt-val" style="color:var(--metric-deaths)">${match.deaths !== undefined ? match.deaths : '—'}</span></div>`;
  }
  if (metrics.includes('time')) {
    html += `<div class="rt-row"><span class="rt-label">Tempo</span><span class="rt-val">${match.time !== undefined ? match.time + 'min' : '—'}</span></div>`;
  }
  if (metrics.includes('kd')) {
    html += `<div class="rt-row"><span class="rt-label">K/D</span><span class="rt-val" style="color:var(--metric-kd)">${match.kd !== undefined ? match.kd : '—'}</span></div>`;
  }
  if (metrics.includes('kpm')) {
    html += `<div class="rt-row"><span class="rt-label">KPM</span><span class="rt-val" style="color:var(--metric-kpm)">${match.kpm !== undefined ? match.kpm : '—'}</span></div>`;
  }
  if (metrics.includes('kpd')) {
    html += `<div class="rt-row"><span class="rt-label">KPD</span><span class="rt-val" style="color:var(--metric-kpd)">${match.kpd !== undefined ? match.kpd : '—'}</span></div>`;
  }
  if (metrics.includes('points')) {
    html += `<div class="rt-row"><span class="rt-label">Pontos</span><span class="rt-val" style="color:var(--metric-points)">${match.points !== undefined ? match.points : '—'}</span></div>`;
  }
  if (metrics.includes('damage')) {
    html += `<div class="rt-row"><span class="rt-label">Dano</span><span class="rt-val" style="color:var(--metric-damage)">${match.damage !== undefined ? match.damage : '—'}</span></div>`;
  }
  if (metrics.includes('assists')) {
    html += `<div class="rt-row"><span class="rt-label">Assist.</span><span class="rt-val" style="color:var(--metric-assists)">${match.assists !== undefined ? match.assists : '—'}</span></div>`;
  }
  if (metrics.includes('position')) {
    html += `<div class="rt-row"><span class="rt-label">Posição</span><span class="rt-val" style="color:var(--metric-position)">${match.position !== undefined ? match.position : '—'}</span></div>`;
  }
  
  if (match.notes) {
    html += `<div class="rt-notes">${match.notes.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
  }
  
  t.innerHTML = html;
  t.style.display = 'block';
  
  const offsetX = 16;
  const offsetY = 16;
  let left = clientX + offsetX;
  let top = clientY + offsetY;
  
  const tRect = t.getBoundingClientRect();
  if (left + tRect.width > window.innerWidth) {
    left = clientX - tRect.width - offsetX;
  }
  if (top + tRect.height > window.innerHeight) {
    top = clientY - tRect.height - offsetY;
  }
  
  t.style.left = left + 'px';
  t.style.top = top + 'px';
}

function hideRecordTooltip() {
  const t = document.getElementById('record-tooltip');
  if (t) t.style.display = 'none';
  const canvas = document.getElementById('ch-evolution');
  if (canvas) canvas.style.cursor = 'default';
}

