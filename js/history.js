/* Nome e Local do Ficheiro: js/history.js */

/* ============================================================
   RENDERIZAÇÃO — HISTÓRICO
   Monta a tabela de partidas com filtro por mapa,
   e a linha de edição inline quando o usuário clica em ✎.
   ============================================================ */
function syncLogBarHeight() {
  const bar = document.querySelector(".log-bar");
  if (!bar) return;
  const h = bar.offsetHeight;
  if (h > 0) document.documentElement.style.setProperty("--log-bar-h", h + "px");
}
window.addEventListener("resize", syncLogBarHeight);

function renderLog() {
  const profile = getActiveProfile();
  if (!profile) {
    document.getElementById("logCount").textContent = "0 partidas";
    document.getElementById("logHead").innerHTML = "";
    document.getElementById("logBody").innerHTML = `<tr><td colspan="99" style="text-align:center;padding:32px 20px;color:var(--sub);"><div class="e-icon" style="font-size:36px;margin-bottom:12px;">📋</div><div class="e-title" style="font-family:'Rajdhani',sans-serif;font-size:18px;color:var(--text);margin-bottom:6px;">Nenhum perfil ativo</div><div class="e-sub" style="font-size:13px;">Crie um perfil para visualizar o histórico de partidas</div></td></tr>`;
    return;
  }
  const metrics = profile.metrics;
  const inputMetrics = metrics.filter(m => METRIC_MAP[m]?.type === "input");
  const calcMetrics = metrics.filter(m => METRIC_MAP[m]?.type === "calc");
  const filter = dashboardMapFilter;
  const filtered = filter ? profile.matches.filter(r => r.map === filter) : profile.matches;
  document.getElementById("logCount").textContent = `${filtered.length} partidas`;

  const mapFilterLabel = document.getElementById('logMapFilterLabel');
  if (mapFilterLabel) {
    mapFilterLabel.textContent = filter || 'Todos os mapas';
    if (dashboardMapFilter) {
      mapFilterLabel.classList.add('filter-pill-val');
    } else {
      mapFilterLabel.classList.remove('filter-pill-val');
    }
  }

  const metricsLabel = document.getElementById('logMetricsLabel');
  if (metricsLabel) {
    metricsLabel.textContent = `${profile.metrics.length} ativas`;
  }

  const resetBtn = document.getElementById('logResetBtn');
  if (resetBtn) {
    resetBtn.style.display = dashboardMapFilter ? '' : 'none';
  }

  function sortIcon(c) { if (logSort.col !== c) return ''; return logSort.dir === 'desc' ? ' ▼' : ' ▲'; }
  function sortStyle(c) { return logSort.col === c ? 'color:var(--brand);' : ''; }
  function sortCursor(c) { return c !== 'map' && c !== 'notes' && c !== '#' ? 'cursor:pointer;' : ''; }
  function sortClick(c) { return c !== 'map' && c !== 'notes' && c !== '#' ? `onclick="sortLogTable('${c}')"` : ''; }

  document.getElementById("logHead").innerHTML = `<th>#</th><th ${sortClick('date')} style="${sortStyle('date')}${sortCursor('date')}white-space:nowrap;">Hora / Data${sortIcon('date')}</th>` + ["map",...inputMetrics,...calcMetrics].map(c => `<th ${sortClick(c)} style="${sortStyle(c)}${sortCursor(c)}white-space:nowrap;">${c==="map"?"Mapa":METRIC_MAP[c]?.label||c}${sortIcon(c)}</th>`).join("") + `<th>Notas</th><th></th>`;

  let sortedFiltered = [...filtered];
  if (logSort.col === 'date') {
    sortedFiltered.sort((a, b) => {
      const timeA = a.match_date ? new Date(a.match_date).getTime() : 0;
      const timeB = b.match_date ? new Date(b.match_date).getTime() : 0;
      return logSort.dir === 'desc' ? timeB - timeA : timeA - timeB;
    });
  } else if (logSort.col) {
    sortedFiltered.sort((a, b) => {
      const valA = a[logSort.col];
      const valB = b[logSort.col];
      const numA = parseFloat(valA);
      const numB = parseFloat(valB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return logSort.dir === 'desc' ? numB - numA : numA - numB;
      }
      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return logSort.dir === 'desc' ? 1 : -1;
      if (strA > strB) return logSort.dir === 'desc' ? -1 : 1;
      return 0;
    });
  }

  document.getElementById("logBody").innerHTML = sortedFiltered.map((r, idx) => {
    const notesIcon = r.notes ? `<span title="${r.notes.replace(/"/g, '&quot;')}" style="cursor:help;color:var(--brand);font-size:14px;">📝</span>` : `<span style="color:var(--muted);font-size:14px;opacity:0.3;">📝</span>`;
    const actionsHtml = profile.isDemo
      ? `<td style="color:var(--muted);font-size:11px;text-align:center;">Somente leitura</td>`
      : `<td class="row-actions"><button class="action-btn" title="Editar" onclick="event.stopPropagation();openAddMatchModal('${r.id}')">✎</button><button class="action-btn" title="Duplicar" onclick="event.stopPropagation();duplicateMatch('${r.id}')">⧉</button><button class="action-btn del" title="Excluir" onclick="event.stopPropagation();deleteMatch('${r.id}')">🗑</button></td>`;

    const rowAttrs = profile.isDemo
      ? `class="log-row is-demo"`
      : `class="log-row" onclick="openAddMatchModal('${r.id}')"`;

    return `<tr ${rowAttrs}>
      <td class="r-num" style="color:var(--sub);font-size:12px">#${r.match_number || (filtered.length - idx)}</td>
      <td style="font-size:12px;color:var(--sub);white-space:nowrap;">${formatDate(r.match_date)}</td>
      <td style="font-family:'Rajdhani',sans-serif;font-weight:600;">${r.map}</td>
      ${inputMetrics.filter(m=>m!=="map").map(m => { const val=r[m]; let style="font-family:'Rajdhani',sans-serif;"; const colorVar=METRIC_COLORS[m]; if(colorVar)style+=`color:${colorVar};`; return `<td style="${style}">${val!==undefined&&val!==null?(m==="time"?formatDuration(val):val):"—"}</td>`; }).join("")}
      ${calcMetrics.map(m => `<td class="r-num" style="color:${METRIC_COLORS[m]||'var(--sub)'}">${r[m]!==undefined&&r[m]!==null?r[m]:"—"}</td>`).join("")}
      <td style="text-align:center;">${notesIcon}</td>
      ${actionsHtml}
    </tr>`;
  }).join("");
  syncLogBarHeight();
}

function sortLogTable(col) {
  if (logSort.col === col) {
    logSort.dir = logSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    logSort.col = col;
    logSort.dir = 'desc';
  }
  renderLog();
}



function deleteMatch(id) {
  const profile = getActiveProfile();
  if (profile.isDemo) {
    showToast("⚠ Não é possível excluir partidas do perfil de demonstração");
    return;
  }

  profile.matches = profile.matches.filter(r => r.id !== id);
  normalizeProfileMatches(profile);
  saveState();
  syncToCloud("delete_match", { profileId: activeProfileId, matchId: id });
  renderLog(); showToast("Partida removida");
}

function duplicateMatch(id) {
  const profile = getActiveProfile();
  if (!profile) return;
  if (profile.isDemo) {
    showToast("⚠ Não é possível duplicar partidas do perfil de demonstração");
    return;
  }

  const original = profile.matches.find(r => r.id === id);
  if (!original) return;

  const copy = { ...original };
  copy.id = "m" + Date.now() + Math.random().toString(36).substr(2, 5);
  copy.match_date = new Date().toISOString();
  profile.matches.push(copy);
  normalizeProfileMatches(profile);
  saveState();

  syncToCloud("upsert_match", { profileId: activeProfileId, match: copy })
    .then(cloudId => {
      if (cloudId) {
        copy.id = cloudId;
        saveState();
      }
    })
    .catch(err => console.error("Erro ao sincronizar cópia:", err));

  renderLog();
  showToast("✓ Partida duplicada");
}

/* ============================================================
   TOOLTIP "CLIQUE PARA EDITAR" NAS LINHAS DO HISTÓRICO
   Só aparece se o cursor ficar PARADO sobre a linha por
   SHOW_DELAY ms. Some imediatamente assim que o cursor se move.
   Elemento fixo em <body> para não ser cortado pelo scroll
   horizontal da tabela (.log-scroll).
   ============================================================ */
(function setupLogRowTooltip() {
  const SHOW_DELAY = 650;

  function init() {
    const tbody = document.getElementById("logBody");
    if (!tbody) return;

    const tip = document.createElement("div");
    tip.id = "log-row-tooltip";
    tip.textContent = "Clique para editar";
    document.body.appendChild(tip);

    let showTimer = null;

    function hide() {
      clearTimeout(showTimer);
      showTimer = null;
      tip.style.display = "none";
    }

    function schedule(x, y) {
      clearTimeout(showTimer);
      tip.style.display = "none";
      showTimer = setTimeout(function() {
        tip.style.left = (x + 14) + "px";
        tip.style.top = (y + 16) + "px";
        tip.style.display = "block";
      }, SHOW_DELAY);
    }

    function isEditableRow(target) {
      const row = target.closest("tr.log-row");
      if (!row || row.classList.contains("is-demo")) return false;
      if (target.closest(".action-btn")) return false;
      return true;
    }

    tbody.addEventListener("mouseover", function(e) {
      if (isEditableRow(e.target)) schedule(e.clientX, e.clientY);
      else hide();
    });

    tbody.addEventListener("mousemove", function(e) {
      if (isEditableRow(e.target)) schedule(e.clientX, e.clientY);
      else hide();
    });

    tbody.addEventListener("mouseout", function(e) {
      const row = e.target.closest("tr.log-row");
      if (!row) return;
      if (e.relatedTarget && row.contains(e.relatedTarget)) return;
      hide();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();