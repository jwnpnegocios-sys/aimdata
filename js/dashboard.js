/* Nome e Local do Ficheiro: js/dashboard.js */

/* ============================================================
   RENDERIZAÇÃO — DASHBOARD
   Monta os KPIs, gráfico de evolução, gráfico de barras
   por mapa e tabela de mapas. Tudo que aparece na aba
   "Dashboard".
   ============================================================ */

function computeMapAgg(matches, metrics) {
  const mapGroups = {};
  matches.forEach(r => {
    if (!mapGroups[r.map]) mapGroups[r.map] = [];
    mapGroups[r.map].push(r);
  });
  const mapAgg = {};
  Object.entries(mapGroups).forEach(([mapName, mapMatches]) => {
    const sample = mapMatches;
    const games = sample.length;
    mapAgg[mapName] = { games };
    metrics.forEach(mid => {
      const meta = METRIC_MAP[mid];
      if (!meta) return;
      if (meta.type === 'input') {
        mapAgg[mapName][mid] = sample.reduce((a, r) => a + (r[mid] || 0), 0);
      } else if (meta.type === 'calc') {
        if (mid === 'kd') {
          const kills = sample.reduce((a, r) => a + (r.kills || 0), 0);
          const deaths = sample.reduce((a, r) => a + (r.deaths || 0), 0);
          mapAgg[mapName][mid] = deaths > 0 ? +(kills / deaths).toFixed(2) : (kills > 0 ? kills : 0);
        } else if (mid === 'kpm') {
          const kills = sample.reduce((a, r) => a + (r.kills || 0), 0);
          const time = sample.reduce((a, r) => a + (r.time || 0), 0);
          mapAgg[mapName][mid] = time > 0 ? +(kills / time).toFixed(2) : 0;
        } else if (mid === 'kpd') {
          const deaths = sample.reduce((a, r) => a + (r.deaths || 0), 0);
          const time = sample.reduce((a, r) => a + (r.time || 0), 0);
          mapAgg[mapName][mid] = time > 0 ? +(deaths / time).toFixed(2) : 0;
        } else {
          const vals = sample.map(r => r[mid]).filter(v => v !== undefined && v !== null && !isNaN(v));
          const sum = vals.reduce((a, b) => a + b, 0);
          mapAgg[mapName][mid] = vals.length ? +(sum / vals.length).toFixed(2) : 0;
        }
      }
    });
  });
  return mapAgg;
}

function resolveDashboardMetricTab(profile) {
  if (!profile) return null;
  const perfMetrics = profile.metrics.filter(m => m !== 'games' && m !== 'time');
  if (!perfMetrics.length) return null;
  if (dashboardMetricTab && perfMetrics.includes(dashboardMetricTab)) {
    return dashboardMetricTab;
  }
  const PRIORITY = ["kd","kpm","kpd","kills","deaths","points","damage","assists","position"];
  for (const m of PRIORITY) {
    if (perfMetrics.includes(m)) return m;
  }
  return perfMetrics[0];
}

function setDashboardMetricTab(tab) {
  const profile = getActiveProfile();
  if (!profile) return;
  const perfMetrics = profile.metrics.filter(m => m !== 'games' && m !== 'time');
  if (!perfMetrics.includes(tab)) return;
  dashboardMetricTab = tab;
  mapSort.col = tab;
  mapSort.dir = (tab === 'kpd' || tab === 'position') ? 'asc' : 'desc';
  evolutionTab = tab;
  renderDashboard();
}

function buildMapTableHeadHtml(mapArr, metrics) {
  function sortIcon(c) { if (mapSort.col !== c) return ''; return mapSort.dir === 'desc' ? ' ▼' : ' ▲'; }
  const partidasLabel = 'Partidas';
  let ths = `<th class="map-col-map">Mapa</th><th class="map-col-partidas" style="cursor:pointer" onclick="sortMapTable('games')">${partidasLabel}${sortIcon('games')}</th>`;
  metrics.forEach(mid => {
    const meta = METRIC_MAP[mid];
    if (!meta) return;
    ths += `<th class="map-col-metric" style="cursor:pointer" onclick="sortMapTable('${mid}')">${meta.label}${sortIcon(mid)}</th>`;
  });
  const tbody = mapArr.map(m => {
    let tds = `<td class="map-col-map"><span class="map-name">${m.map}</span></td><td class="num map-col-partidas">${m.games}</td>`;
    metrics.forEach(mid => {
      const meta = METRIC_MAP[mid];
      if (!meta) return;
      const colorVar = `var(--metric-${mid})`;
      tds += `<td class="num map-col-metric" style="color:${colorVar}">${m[mid] !== undefined ? (mid === 'time' ? formatDuration(m[mid]) : m[mid]) : '—'}</td>`;
    });
    return `<tr>${tds}</tr>`;
  }).join("");
  return `<thead><tr>${ths}</tr></thead><tbody>${tbody}</tbody>`;
}

function buildMapPerformanceCardHtml(titleClass, canvasHeight, highlightedMap, metrics) {
  const highlightLabel = highlightedMap ? ` <span style="color:var(--brand);font-size:12px;font-family:'Rajdhani',sans-serif;">— ${highlightedMap}</span>` : '';
  return `<div class="card">
    <div class="map-card-title">
      <div class="map-card-title-left">
        <div class="card-title ${titleClass}" style="margin-bottom:0;">Performance por Mapa${highlightLabel}</div>
        <div class="map-help">
          <span>?</span>
          <div class="map-help-tooltip">
            <strong>Métrica ativa</strong> — o gráfico e a tabela seguem a métrica selecionada na barra global acima. As barras se reordenam automaticamente (maior para a esquerda; KPD é invertido — menor é melhor).<br><br>
            <strong>Amplitude</strong> — diferença entre o melhor e o pior mapa na métrica atual. Quanto mais baixa, mais consistente é seu desempenho entre cenários diferentes. Mapas distintos oferecem oportunidades, riscos e consequências diferentes, então uma amplitude pequena indica domínio estável independente do cenário.<br><br>
            <strong>Meta</strong> — a linha tracejada mostra sua meta pessoal definida no Quadro de Desempenho. Clique em <em>Meta</em> na legenda para mostrar ou ocultar a linha.<br><br>
            <strong>Ordenação da tabela</strong> — clique nos cabeçalhos Partidas, K/D, KPM ou KPD para ordenar. Clique novamente para inverter.<br><br>
            <strong>Passar o mouse</strong> sobre uma barra revela K/D, KPM, KPD e partidas daquele mapa específico.<br><br>
            <strong>Destaque:</strong> quando um mapa é selecionado no filtro global, ele permanece em cor plena enquanto os demais ficam opacos. Assim você vê sua posição relativa entre todos os cenários.<br><br>
            <strong>Recorte justo:</strong> quando o filtro é "Últimas N partidas", este gráfico analisa as últimas N partidas de <em>cada mapa</em> individualmente. Isso garante comparação estatística equilibrada — o Mirage não fica prejudicado se você jogou mais Dust2 recentemente. O filtro de período (data) mantém o comportamento absoluto.<br><br>
            <strong>Filtro global:</strong> a barra no topo define o recorte. Este card ignora o filtro de mapa para manter o contexto comparativo, mas respeita a quantidade/período.
          </div>
        </div>
      </div>
      <div id="map-amplitude-indicator" style="text-align:right;z-index:5;"></div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <button class="map-tab-btn ${mapSort.col === 'games' ? 'active' : ''}" style="height:32px;font-size:12px;" onclick="sortMapTable('games')">Ordenar por Partidas</button>
    </div>
    <canvas id="ch-mapbars" height="${canvasHeight}"></canvas>
    <button class="map-toggle" onclick="toggleMapTable()">${mapTableVisible ? '▾ Ocultar dados' : '▸ Mostrar dados'}</button>
    <div id="mapTableWrap" style="overflow-x:auto;${mapTableVisible ? '' : 'display:none;'}"><table class="map-table" id="mapTableHead"></table></div>
  </div>`;
}

function renderDashboard() {
  const profile = getActiveProfile();
  const inner = document.getElementById("dash-inner");
  if (!profile) {
    inner.innerHTML = `
      <div class="onboarding">
        <div class="onboarding-hero">
          <h1>Registre. Analise. <em>Evolua.</em></h1>
          <p>Acompanhe sua performance em jogos de tiro. Veja estatísticas por mapa, metas de K/D, KPM e sua evolução ao longo do tempo.</p>
          <button class="onboarding-cta" onclick="openModal('new')">Criar primeiro perfil</button>
          <div class="onboarding-note">Gratuito. Seus dados ficam salvos no navegador.</div>
        </div>
        <div class="onboarding-steps">
          <div class="step-card">
            <div class="step-number">1</div>
            <h3>Crie um perfil</h3>
            <p>Escolha o jogo, modo de jogo e os mapas que você joga regularmente.</p>
          </div>
          <div class="step-card">
            <div class="step-number">2</div>
            <h3>Registre partidas</h3>
            <p>Após cada partida, adicione kills, deaths, tempo e outras métricas.</p>
          </div>
          <div class="step-card">
            <div class="step-number">3</div>
            <h3>Veja estatísticas</h3>
            <p>Gráficos de evolução, performance por mapa, médias móveis e metas.</p>
          </div>
        </div>
      </div>`;
    return;
  }
  const metrics = profile.metrics;
  dashboardMetricTab = resolveDashboardMetricTab(profile);
  if (!dashboardMetricTab) {
    inner.innerHTML = `
      <div class="onboarding" style="padding:48px 20px;">
        <div class="onboarding-hero" style="margin-bottom:0;">
          <div class="e-icon" style="font-size:36px;margin-bottom:12px;">📊</div>
          <h1 style="font-size:22px;margin-bottom:12px;">Nenhuma métrica de performance ativa</h1>
          <p style="max-width:480px;margin:0 auto 20px;">Ative pelo menos uma métrica de performance (K/D, KPM, KPD, etc.) no popover de métricas no topo do dashboard para visualizar as estatísticas.</p>
        </div>
      </div>`;
    return;
  }
  mapSort.col = dashboardMetricTab;
  mapSort.dir = (dashboardMetricTab === 'kpd' || dashboardMetricTab === 'position') ? 'asc' : 'desc';
  evolutionTab = dashboardMetricTab;
  const matches = getDashboardMatches(profile);
  if (!matches.length) {
    const hasAnyMatches = profile.matches && profile.matches.length > 0;
    if (hasAnyMatches) {
      const filterDesc = dashboardSince
        ? `a partir de ${dashboardSince.split('-').reverse().join('/')}`
        : (dashboardRecords !== null ? `nas últimas ${dashboardRecords} partidas` : 'no período selecionado');
      inner.innerHTML = `
        <div class="onboarding" style="padding:48px 20px;">
          <div class="onboarding-hero" style="margin-bottom:0;">
            <div class="e-icon" style="font-size:36px;margin-bottom:12px;">🔍</div>
            <h1 style="font-size:22px;margin-bottom:12px;">Nenhuma partida encontrada</h1>
            <p style="max-width:480px;margin:0 auto 20px;">Seu perfil <strong>${profile.game}${profile.mode ? ' · ' + profile.mode : ''}</strong> tem <strong>${profile.matches.length}</strong> partida(s) registrada(s), mas nenhuma delas está ${filterDesc}.</p>
            <button class="onboarding-cta" onclick="dashboardSince=null;dashboardRecords=null;renderDashboard();showToast('✓ Filtro limpo — mostrando todas as partidas')">Mostrar todas as partidas</button>
          </div>
        </div>`;
    } else {
      inner.innerHTML = `
        <div class="onboarding" style="padding:32px 20px;">
          <div class="onboarding-hero" style="margin-bottom:32px;">
            <h1 style="font-size:24px;">Perfil criado com sucesso!</h1>
            <p>Seu perfil <strong>${profile.game}${profile.mode ? ' · ' + profile.mode : ''}</strong> está pronto. Registre sua primeira partida para começar a ver estatísticas.</p>
            <button class="onboarding-cta" onclick="openAddMatchModal()">→ Registrar primeira partida</button>
          </div>
          <div style="background:var(--surface);border:1px solid var(--border);padding:24px;opacity:0.4;pointer-events:none;">
            <div class="card-title brand" style="margin-bottom:16px;">Preview do seu dashboard</div>
            <div style="height:180px;background:repeating-linear-gradient(0deg,transparent,transparent 19px,var(--border) 20px);border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;">
              Gráfico de evolução aparecerá aqui após 2+ partidas
            </div>
          </div>
        </div>`;
    }
    return;
  }
  const PRIORITY_ORDER = ["kd","kpm","kpd","kills","deaths","points","damage","assists","position"];
  const chartable = PRIORITY_ORDER.filter(m => metrics.includes(m) && CHARTABLE.includes(m));
  let html = '<div class="dash-board">';
  
  if (profile.isDemo) {
    html += `<div style="background:linear-gradient(90deg,rgba(0,229,255,0.08),rgba(0,229,255,0.02));border:1px solid var(--brand);border-radius:8px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:var(--brand);margin-bottom:4px;">🎯 Modo de Demonstração</div>
        <div style="font-size:13px;color:var(--sub);line-height:1.5;">Você está visualizando dados de exemplo. Crie seu próprio perfil para começar a registrar partidas reais.</div>
      </div>
      <button class="onboarding-cta" onclick="removeDemoProfile();openModal('new');" style="white-space:nowrap;">Criar meu perfil</button>
    </div>`;
  }
  
  const isFiltered = dashboardRecords !== 30 || dashboardSince || dashboardMapFilter;
  const recorteLabel = dashboardSince
    ? `Desde ${dashboardSince.split('-').reverse().join('/')}`
    : (dashboardRecords === null ? 'Todas as partidas' : `Últimas ${dashboardRecords} partidas`);
  const mapLabel = dashboardMapFilter || 'Todos os mapas';

  html += `<div id="dash-filter-bar">
    <div class="filter-pill" onclick="openFilterPopover('recorte', this)">
      <span style="color:var(--sub);font-family:'Rajdhani',sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Filtro</span>
      <span class="filter-pill-val">${recorteLabel}</span>
    </div>
    <span style="color:var(--muted);font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;">|</span>
    <div class="filter-pill" onclick="openFilterPopover('mapa', this)">
      <span style="color:var(--sub);font-family:'Rajdhani',sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">MAPA</span>
      <span class="${dashboardMapFilter ? 'filter-pill-val' : ''}">${mapLabel}</span>
    </div>
    <span style="color:var(--muted);font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;">|</span>
    <div class="filter-pill" onclick="openMetricsPopover(this)">
      <span style="color:var(--sub);font-family:'Rajdhani',sans-serif;font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Métricas</span>
      <span class="filter-pill-val">${profile.metrics.length} ativas</span>
    </div>
    ${isFiltered ? `<button class="filter-pill-reset" onclick="resetDashboardFilters()" title="Limpar filtros">↺</button>` : ''}
    <span style="color:var(--muted);font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:700;">|</span>
    <div class="map-help" style="position:relative;">
      <span>?</span>
      <div class="map-help-tooltip" style="right:0;left:auto;width:280px;">
        <strong style="color:var(--brand);font-family:'Rajdhani',sans-serif;">Filtro Global do Dashboard</strong><br><br>
        <strong>📊 Recorte:</strong> clique para escolher entre 10, 30, 90 ou Todas as partidas, ou definir um período por data. Partidas e período são mutuamente exclusivos.<br><br>
        <strong>🗺 Mapa:</strong> clique para selecionar um mapa específico ou voltar a "Todos os mapas".<br><br>
        <strong>↺ Reset:</strong> aparece automaticamente quando qualquer filtro está ativo. Restaura o padrão (Últimas 30 · Todos os mapas).<br><br>
        <em>O Quadro de Desempenho e o Gráfico de Evolução respeitam todos os filtros ativos. O card Performance por Mapa respeita o recorte, mas ignora o filtro de mapa para manter o contexto comparativo.</em>
      </div>
    </div>
  </div>`;

  html += `<div id="dash-metric-tabs">
    ${profile.metrics.filter(m => m !== 'games' && m !== 'time').map(mid => {
      const meta = METRIC_MAP[mid];
      if (!meta) return '';
      const isActive = dashboardMetricTab === mid;
      const metricClass = `metric-${mid}`;
      return `<button class="map-tab-btn ${isActive ? 'active ' + metricClass : ''}" onclick="setDashboardMetricTab('${mid}')">${meta.label}</button>`;
    }).join('')}
  </div>`;

  const kpiData = [];
  metrics.forEach((mid) => {
    const meta = METRIC_MAP[mid]; if (!meta) return;
    const vals = matches.map(r => r[mid]).filter(v => v !== undefined);
    if (!vals.length) return;
    if (mid === "time") {
      return;
    }
    let avg;
    if (mid === "kd") {
      const totK = matches.reduce((a,r) => a + (r.kills || 0), 0);
      const totD = matches.reduce((a,r) => a + (r.deaths || 0), 0);
      avg = totD > 0 ? +(totK / totD).toFixed(2) : (totK > 0 ? totK : 0);
    } else if (mid === "kpm") {
      const totK = matches.reduce((a,r) => a + (r.kills || 0), 0);
      const totT = matches.reduce((a,r) => a + (r.time || 0), 0);
      avg = totT > 0 ? +(totK / totT).toFixed(2) : 0;
    } else if (mid === "kpd") {
      const totD = matches.reduce((a,r) => a + (r.deaths || 0), 0);
      const totT = matches.reduce((a,r) => a + (r.time || 0), 0);
      avg = totT > 0 ? +(totD / totT).toFixed(2) : 0;
    } else {
      avg = +(vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(2);
    }
    const min = +Math.min(...vals).toFixed(2);
    const max = +Math.max(...vals).toFixed(2);
    const n = vals.length;
    const limitLabel = dashboardRecords === null ? 'Total' : (dashboardSince ? 'Período' : `Últimas ${n}`);
    const label = `Média ${meta.label} (${limitLabel})`;
    const goalKey = `goal_${mid}_${activeProfileId}`;
    const goalVal = localStorage.getItem(goalKey) || "";
    const color = ["kd","kpm","kpd"].includes(mid) ? `metric-${mid}` : mid;
    const allZero = avg === 0 && min === 0 && max === 0;
    const sub = allZero ? 'Todos os registros neste período são 0' : '';
    kpiData.push({ mid, label, val: avg, color, min, max, goalKey, goalVal, sub });
  });

  html += `<div class="card"><div class="map-card-title"><div class="map-card-title-left"><div class="card-title brand" style="margin-bottom:0;">Quadro de Desempenho${dashboardMapFilter ? ` <span style="color:var(--brand);font-size:12px;font-family:'Rajdhani',sans-serif;">— ${dashboardMapFilter}</span>` : ''}</div><div class="map-help"><span>?</span><div class="map-help-tooltip" style="width:320px;"><strong style="color:var(--brand);font-family:'Rajdhani',sans-serif;">Quadro de Desempenho</strong><br><br><strong>Filtro Global</strong> — todos os valores deste quadro respeitam o filtro ativo no topo do Dashboard (últimas N partidas ou período por data). Médias, mínimos e máximos são recalculados automaticamente conforme o recorte.<br><br><strong>Média</strong> — valor central exibido em destaque. É a soma da métrica dividida pelo número de partidas no filtro.<br><br><strong>min / max</strong> — menor e maior valor individual alcançado em uma única partida dentro do período selecionado.<br><br><strong>Meta Pessoal</strong> — clique no campo tracejado abaixo da média, digite o valor desejado e pressione Enter. A meta é salva automaticamente no navegador.<br><br><strong>Progresso</strong> — aparece logo abaixo da meta. Verde = acima da meta (bom). Vermelho = abaixo da meta. Ciano = exatamente na meta.<br><br><strong>Métricas Invertidas</strong> — KPD e Posição funcionam ao contrário: quanto menor, melhor. O progresso inverte a lógica: verde quando você está ABAIXO da meta, vermelho quando ACIMA.</div></div></div></div>`;
  const activeMid = dashboardMetricTab;
  const availableMids = kpiData.map(k => k.mid);
  
  if (!availableMids.includes(activeMid)) {
    html += `<div style="padding:24px;color:var(--muted);text-align:center;font-size:13px;">Nenhum dado calculado para ${METRIC_MAP[activeMid]?.label || activeMid} no período selecionado.</div>`;
  } else {
    const perfMetrics = profile.metrics.filter(m => m !== 'games' && m !== 'time');
    const sideCandidates = PRIORITY_ORDER.filter(m => perfMetrics.includes(m) && m !== activeMid && availableMids.includes(m));
    const leftMid = sideCandidates[0] || null;
    const rightMid = sideCandidates[1] || null;
    const orderedMids = [leftMid, activeMid, rightMid].filter(m => m !== null);
    const displayKpiData = orderedMids.map(mid => kpiData.find(k => k.mid === mid)).filter(k => k !== undefined);
    const isTriple = displayKpiData.length === 3;
    const gridClass = isTriple ? 'kpi-grid triple' : 'kpi-grid';
    html += `<div class="${gridClass}">${displayKpiData.map(k => {
      const isCenter = k.mid === activeMid;
      const kpiClass = isCenter ? `kpi ${k.color} kpi-center` : `kpi ${k.color} kpi-side`;
      const hasRange = isCenter && k.min !== undefined && k.max !== undefined;
      const rangeHtml = hasRange ? `<div class="kpi-range"><span class="kpi-min">${k.min}</span><span class="kpi-max">${k.max}</span></div>` : '';
      const subHtml = isCenter && k.sub ? `<div class="kpi-sub">${k.sub}</div>` : '';
      const colorVar = k.color === 'confirm' ? 'confirm' : k.color;
      let metaHtml = '';
      let progressHtml = '';
      let helpHtml = '';
      if (isCenter) {
        if (k.goalKey && k.goalVal) {
          const goal = parseFloat(k.goalVal);
          const diff = +(k.val - goal).toFixed(2);
          const isInverted = k.goalKey.includes('kpd') || k.goalKey.includes('position');
          let progressClass = 'on-target';
          let progressText = 'na meta';
          if (diff > 0) {
            progressClass = isInverted ? 'above-bad' : 'above';
            progressText = `+${diff} acima`;
          } else if (diff < 0) {
            progressClass = isInverted ? 'below-good' : 'below';
            progressText = `${diff} abaixo`;
          }
          progressHtml = `<div class="kpi-progress ${progressClass}">${progressText}</div>`;
        }
        const helpKey = k.goalKey ? k.goalKey.replace(`_${activeProfileId}`, '').replace('goal_', '') : null;
        metaHtml = k.goalKey ? `<div class="kpi-meta"><span class="kpi-meta-label ${k.color}">Meta ${METRIC_MAP[helpKey]?.label || ''}</span><input class="kpi-goal-inline ${k.color}" type="number" value="${k.goalVal}" placeholder="—" step="0.01" onblur="saveGoal('${k.goalKey}',this.value)" onkeydown="if(event.key==='Enter')this.blur()"></div>${progressHtml}` : '';
        helpHtml = helpKey ? `<div class="kpi-header"><div class="kpi-help"><span>?</span><div class="kpi-tooltip">${KPI_HELP[helpKey]}</div></div></div>` : '';
      }
      const clickAttr = isCenter ? '' : ` onclick="setDashboardMetricTab('${k.mid}')"`;
      return `<div class="${kpiClass}" data-goal-key="${k.goalKey||''}"${clickAttr}>${helpHtml}${metaHtml}<div class="kpi-main"><div class="kpi-label">${k.label}</div><div class="kpi-val ${colorVar}">${k.val}</div></div>${rangeHtml}${subHtml}</div>`;
    }).join("")}</div>`;
  }
  html += `</div>`;

  if (!chartable.length) {
    html += `<div class="no-chart">⚠ Nenhuma métrica permite gráfico.<br><small>Ative métricas como K/D, KPM ou Kills no perfil.</small></div>`;

  } else {
    const evoMid = dashboardMetricTab && chartable.includes(dashboardMetricTab) ? dashboardMetricTab : null;
    html += `<div class="card" style="position:relative;">
      <div id="evolution-indicator" style="position:absolute;top:14px;right:20px;text-align:right;z-index:5;"></div>
      <div class="map-card-title">
        <div class="map-card-title-left">
          <div class="card-title brand" style="margin-bottom:0;">Gráfico de Evolução${dashboardMapFilter ? ` <span style="color:var(--brand);font-size:12px;font-family:'Rajdhani',sans-serif;">— ${dashboardMapFilter}</span>` : ''}</div>
            <div class="map-help">
            <span>?</span>
            <div class="map-help-tooltip">
              <strong>Linha fina:</strong> valor bruto de cada partida (${evoMid ? METRIC_MAP[evoMid]?.label || evoMid : 'métrica ativa'}).<br><br>
              <strong>Linha tracejada:</strong> média móvel de 10 partidas — suaviza picos e mostra a tendência real.<br><br>
              <strong>🥇🥈🥉 Bolinhas:</strong> recordes pessoal nas partidas exibidas. Ouro = melhor, Prata = 2º, Bronze = 3º. Para KPD, menor valor vence.<br><br>
              <strong>Indicador %:</strong> no canto superior direito. Compara a primeira metade das partidas com a segunda metade. Verde = evolução, vermelho = regressão, ciano = estável.<br><br>
              <strong>Total:</strong> histórico completo (compara 30 primeiras vs 30 últimas quando há 60+ partidas).<br>
              <strong>Recente:</strong> só as últimas 30 partidas (compara 15 primeiras vs 15 últimas desse bloco).<br><br>
              <em>Quanto mais partidas registradas, mais confiável a tendência.</em>
            </div>
          </div>
        </div>
      </div>`;
    if (evoMid) {
      html += `<canvas id="ch-evolution" height="200"></canvas>`;
    } else {
      html += `<div class="no-chart" style="margin:20px 0;">⚠ A métrica ativa não permite gráfico de evolução.<br><small>Selecione uma métrica chartável na barra global.</small></div>`;
    }
    html += `</div>`;
  }
  
  const allMapsInPeriod = [...new Set(getMapPerformanceMatches(profile).map(r => r.map))];
  if (allMapsInPeriod.length > 1 && metrics.includes("kills")) {
    html += buildMapPerformanceCardHtml('brand', 280, dashboardMapFilter || null, profile.metrics);
  } else if (allMapsInPeriod.length > 1) {
    html += buildMapPerformanceCardHtml('brand', 200, dashboardMapFilter || null, profile.metrics);
  }
  
  html += '</div>';
  inner.innerHTML = html;
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });
  charts = {};
  if (!chartable.length) return;
  
  const GRID = "rgba(30,36,48,0.8)";
  const TICK = "#4a5568";
  Chart.defaults.font.family = "Inter";
  Chart.defaults.color = TICK;
  
  const baseOpts = () => ({
    responsive:true,
    plugins:{ legend:{labels:{color:TICK,boxWidth:12,font:{size:11}}}, tooltip:{backgroundColor:"#11141b",borderColor:"#1e2430",borderWidth:1} },
    scales:{ x:{ticks:{color:TICK,font:{size:10}},grid:{color:GRID}}, y:{ticks:{color:TICK,font:{size:10}},grid:{color:GRID}} }
  });
  
    const evoCanvas = document.getElementById("ch-evolution");
    if (evoCanvas && chartable.includes(evolutionTab)) {
      const mid = evolutionTab;
      const evoMatches = matches;
      const labels = evoMatches.map(r => r.match_number);
      const vals = evoMatches.map(r => r[mid] ?? 0);
      const hexColor = getComputedStyle(document.documentElement).getPropertyValue(METRIC_COLORS[mid].replace('var(','').replace(')','')).trim() || '#b388ff';
      const maVals = movingAverage(vals, 10);
      const maColor = hexColor;
      const hasRecordDots = mid in RECORD_METRICS;
      const isInvertedMetric = RECORD_METRICS[mid] || false;
      charts["evolution"] = new Chart(evoCanvas.getContext("2d"), {
        type: "line",
        data: { labels, datasets: [
          { label: METRIC_MAP[mid].label, data: vals, borderColor: hexColor, backgroundColor: hexColor + "0d", borderWidth: 1.5, pointRadius: 1, pointHoverRadius: 4, tension: 0.3, fill: true, order: 2 },
          { label: "Média Móvel (10)", data: maVals, borderColor: maColor, backgroundColor: "transparent", borderWidth: 3, pointRadius: 0, pointHoverRadius: 0, tension: 0.4, borderDash: [6, 4], fill: false, order: 1 }
        ]},
        plugins: [recordDotsPlugin],
        options: {
          ...baseOpts(),
          interaction: { mode: "index", intersect: false },
          plugins: {
            ...baseOpts().plugins,
            legend: {
              labels: {
                boxWidth: 16,
                boxHeight: 16,
                generateLabels: function(chart) {
                  const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
                  if (chart._hasRecordDots) {
                    original.push({
                      text: '🏆 Recordes',
                      fillStyle: chart._recordDotsVisible ? chart._hexColor : 'transparent',
                      strokeStyle: chart._recordDotsVisible ? chart._hexColor : '#4a5568',
                      lineWidth: 2,
                      hidden: !chart._recordDotsVisible,
                      datasetIndex: 99
                    });
                  }
                  return original;
                }
              },
              onClick: function(e, legendItem, legend) {
                if (legendItem.datasetIndex === 99) {
                  toggleRecordDots();
                  return;
                }
                const index = legendItem.datasetIndex;
                const ci = legend.chart;
                if (ci.isDatasetVisible(index)) {
                  ci.hide(index);
                  legendItem.hidden = true;
                } else {
                  ci.show(index);
                  legendItem.hidden = false;
                }
              }
            },
            recordDots: { enabled: hasRecordDots && recordDotsVisible, inverted: isInvertedMetric }
          },
          scales: {
            x: { type: 'category', ticks: { color: TICK, font: { size: 10 } }, grid: { color: GRID } },
            y: { ticks: { color: TICK, font: { size: 10 } }, grid: { color: GRID }, suggestedMax: Math.max(...vals.filter(v => v > 0).sort((a, b) => a - b).slice(0, Math.ceil(vals.length * 0.95))) || 5 }
          }
        }
      });
      charts["evolution"]._hasRecordDots = hasRecordDots;
      charts["evolution"]._hexColor = hexColor;
      charts["evolution"]._recordDotsVisible = recordDotsVisible;
      charts["evolution"]._matchesUsed = evoMatches;
      charts["evolution"].update();

      refreshMapAmplitude();

      if (!evoCanvas._recordHoverAttached) {
        evoCanvas.addEventListener('mousemove', handleRecordHover);
        evoCanvas.addEventListener('mouseleave', hideRecordTooltip);
        evoCanvas._recordHoverAttached = true;
      }

      refreshEvolutionIndicator();
    }
  
  const mapCtx = document.getElementById("ch-mapbars");
  if (mapCtx) {
    const mapAgg = computeMapAgg(getMapPerformanceMatches(profile), profile.metrics);
    const sortCol = mapSort.col;
    const mapArr = Object.entries(mapAgg).map(([map, s]) => ({ map, ...s }));
    mapArr.sort((a, b) => {
      const valA = a[sortCol];
      const valB = b[sortCol];
      return mapSort.dir === 'desc' ? valB - valA : valA - valB;
    });
    
    const vals = mapArr.map(m => m[sortCol]);
    const sortColor = METRIC_COLORS[sortCol] || 'var(--brand)';
    const sortHex = getComputedStyle(document.documentElement).getPropertyValue(sortColor.replace('var(','').replace(')','')).trim() || '#00e5ff';
    const partidasLabel = 'Partidas';
    
    const goalValue = getMapGoalValue(sortCol, activeProfileId);
    const mapDatasets = [{
      label: sortCol === 'games' ? partidasLabel : (METRIC_MAP[sortCol]?.label || sortCol.toUpperCase()),
      data: vals,
      backgroundColor: mapArr.map(m => !dashboardMapFilter || m.map === dashboardMapFilter ? sortHex + "d9" : sortHex + "33"),
      borderColor: mapArr.map(m => !dashboardMapFilter || m.map === dashboardMapFilter ? sortHex : sortHex + "44"),
      borderWidth: 1,
      borderRadius: 3,
      barPercentage: 0.65,
    }];

    charts["mapbars"] = new Chart(mapCtx.getContext("2d"), {
      type: "bar",
      data: {
        labels: mapArr.map((m, i) => mapRankVisible ? `${i + 1}º ${m.map}` : m.map),
        datasets: mapDatasets
      },
      plugins: [ChartDataLabels, mapGoalLinePlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: TICK,
              boxWidth: 12,
              font: { size: 11 },
            generateLabels: function(chart) {
              const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
              const goalValue = chart.options.plugins.mapGoalLine?.goalValue;
              const goalEnabled = chart.options.plugins.mapGoalLine?.enabled;
              if (goalValue !== null && goalValue !== undefined && goalValue > 0) {
                const sortHex = chart.options.plugins.mapGoalLine?.color?.replace('33', '') || '#00e5ff';
                original.push({
                  text: 'Meta',
                  fillStyle: 'transparent',
                  strokeStyle: sortHex,
                  lineWidth: 2,
                  lineDash: [6, 4],
                  hidden: !goalEnabled,
                  datasetIndex: 99
                });
              }
              const rankColor = chart.options.plugins.mapGoalLine?.color?.replace('33', '') || '#00e5ff'; original.push({ text: 'Posições', fillStyle: mapRankVisible ? rankColor : 'transparent', strokeStyle: mapRankVisible ? rankColor : '#4a5568', lineWidth: 2, hidden: !mapRankVisible, datasetIndex: 98 });
              return original;
            }
          },
          onClick: function(e, legendItem, legend) {
            if (legendItem.datasetIndex === 99) {
              mapGoalVisible = !mapGoalVisible;
              const chart = legend.chart;
              chart.options.plugins.mapGoalLine.enabled = mapGoalVisible && chart.options.plugins.mapGoalLine.goalValue > 0;
              chart.update();
              return;
            }
            if (legendItem.datasetIndex === 98) {
              mapRankVisible = !mapRankVisible;
              localStorage.setItem('gt_mapRankVisible', mapRankVisible);
              const chart = legend.chart;
              chart.data.labels = chart._mapArr.map((m, i) => mapRankVisible ? `${i + 1}º ${m.map}` : m.map);
              chart.update();
              return;
            }
            const index = legendItem.datasetIndex;
            const ci = legend.chart;
            if (ci.isDatasetVisible(index)) {
              ci.hide(index);
              legendItem.hidden = true;
            } else {
              ci.show(index);
              legendItem.hidden = false;
            }
          }
        },
        mapGoalLine: {
          enabled: goalValue !== null && goalValue > 0 && mapGoalVisible,
          goalValue: goalValue,
          color: sortHex + '33'
        },
        datalabels: {
          display: function(context) { return context.datasetIndex === 0; },
          color: sortHex,
          font: { family: 'Rajdhani', size: 13, weight: '700' },
          anchor: 'end',
          align: 'top',
          offset: 4,
          formatter: function(value) { return value; }
        },
          tooltip: {
            backgroundColor: "#11141b",
            borderColor: "#1e2430",
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                const idx = context.dataIndex;
                const chart = context.chart;
                const currentMapArr = chart._mapArr;
                const currentSortCol = chart._sortCol;
                const m = currentMapArr[idx];
                const partidasLabel = 'Partidas';
                const primaryLabel = currentSortCol === 'games' ? partidasLabel : (METRIC_MAP[currentSortCol]?.label || currentSortCol.toUpperCase());
                const lines = [`${primaryLabel}: ${m[currentSortCol]}`];
                profile.metrics.forEach(mid => {
                  if (mid === currentSortCol) return;
                  if (m[mid] !== undefined && m[mid] !== null) {
                    lines.push(`${METRIC_MAP[mid]?.label || mid}: ${mid === 'time' ? formatDuration(m[mid]) : m[mid]}`);
                  }
                });
                if (currentSortCol !== 'games') lines.push(`${partidasLabel}: ${m.games}`);
                return lines;
              }
            }
          }
        },
        layout: {
          padding: { right: 35 }
        },
        scales: {
          x: {
            ticks: { color: TICK, font: { family: 'Rajdhani', size: 11, weight: '700' } },
            grid: { color: GRID }
          },
          y: {
            ticks: { color: TICK, font: { size: 10 } },
            grid: { color: GRID },
            beginAtZero: true,
            suggestedMax: Math.max(...vals) * 1.12
          }
        }
      }
    });
    charts["mapbars"]._mapArr = mapArr; charts["mapbars"]._sortCol = sortCol;
    
    const mapTableHead = document.getElementById("mapTableHead");
    if (mapTableHead) mapTableHead.innerHTML = buildMapTableHeadHtml(mapArr, profile.metrics);
  }
}

function calcAdaptiveEvolution(matches, metricId, isInverted) {
  const total = matches.length;
  if (total < 6) return null;
  let sampleSize = Math.floor(total / 2);
  sampleSize = Math.min(30, sampleSize);
  const first = matches.slice(0, sampleSize);
  const last = matches.slice(-sampleSize);
  function blockValue(arr) {
    if (metricId === "kd") {
      const k = arr.reduce((a, r) => a + (r.kills || 0), 0);
      const d = arr.reduce((a, r) => a + (r.deaths || 0), 0);
      return d > 0 ? k / d : (k > 0 ? k : 0);
    } else if (metricId === "kpm") {
      const k = arr.reduce((a, r) => a + (r.kills || 0), 0);
      const t = arr.reduce((a, r) => a + (r.time || 0), 0);
      return t > 0 ? k / t : 0;
    } else if (metricId === "kpd") {
      const d = arr.reduce((a, r) => a + (r.deaths || 0), 0);
      const t = arr.reduce((a, r) => a + (r.time || 0), 0);
      return t > 0 ? d / t : 0;
    } else {
      const vals = arr.map(r => r[metricId]).filter(v => v !== undefined && v !== null && v > 0);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }
  }
  const avgFirst = blockValue(first);
  const avgLast = blockValue(last);
  if (avgFirst === 0) return null;
  let pct;
  if (isInverted) {
    pct = ((avgFirst - avgLast) / avgFirst) * 100;
  } else {
    pct = ((avgLast - avgFirst) / avgFirst) * 100;
  }
  return {
    pct: Math.round(pct),
    sampleSize,
    totalGames: total,
    avgFirst: +(avgFirst).toFixed(2),
    avgLast: +(avgLast).toFixed(2),
    improved: pct > 0,
    stable: Math.abs(pct) < 5
  };
}

function formatEvolution(ev, variant) {
  if (!ev) return `<span style="color:var(--muted);font-size:11px;">Mínimo 6 partidas</span>`;
  const isRecente = variant === 'recente';
  const stableLabel = isRecente ? 'Platô' : 'Estável';
  const growthLabel = isRecente ? 'Evolução Recente' : 'Evolução Total';
  const dropLabel = isRecente ? 'Regressão Recente' : 'Regressão Total';
  const color = ev.improved ? 'var(--confirm)' : (ev.stable ? 'var(--brand)' : 'var(--danger)');
  const sign = ev.pct > 0 ? '+' : '';
  const arrow = ev.improved ? '▲' : (ev.stable ? '●' : '▼');
  const label = ev.stable ? stableLabel : (ev.improved ? growthLabel : dropLabel);
  const sampleLabel = isRecente
    ? `30 últimas`
    : `${ev.sampleSize} primeiras vs ${ev.sampleSize} últimas`;
  return `<span style="color:${color};font-family:'Rajdhani',sans-serif;font-size:13px;font-weight:600;letter-spacing:0.5px;">
    ${arrow} ${sign}${ev.pct}% ${label}
  </span><br><span style="color:var(--muted);font-size:10px;font-family:'Rajdhani',sans-serif;">
    (${sampleLabel})
  </span>`;
}

function refreshMapAmplitude() {
  const container = document.getElementById("map-amplitude-indicator");
  if (!container) return;
  const profile = getActiveProfile();
  const matches = getMapPerformanceMatches(profile);
  if (!profile || !matches.length) { container.innerHTML = ""; return; }
  const mapAgg = computeMapAgg(matches, profile.metrics);
  const sortCol = mapSort.col;
  const mapArr = Object.entries(mapAgg).map(([map, s]) => ({ map, ...s }));
  mapArr.sort((a, b) => { const valA = a[sortCol]; const valB = b[sortCol]; return mapSort.dir === 'desc' ? valB - valA : valA - valB; });
  const vals = mapArr.map(m => m[sortCol]).filter(v => v !== undefined && v !== null);
  if (vals.length < 2) { container.innerHTML = ""; return; }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const amplitude = +(max - min).toFixed(2);
  const metricLabel = METRIC_MAP[sortCol]?.label || sortCol.toUpperCase();
  container.innerHTML = `<span style="color:var(--sub);font-family:'Rajdhani',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Amplitude ${metricLabel}</span><br><span style="color:var(--text);font-family:'Rajdhani',sans-serif;font-size:18px;font-weight:700;">${amplitude}</span>`;
}

function toggleMapTable() {
  mapTableVisible = !mapTableVisible;
  localStorage.setItem("gt_mapTableVisible", mapTableVisible);
  const wrap = document.getElementById("mapTableWrap");
  const btn = document.querySelector(".map-toggle");
  if (wrap) wrap.style.display = mapTableVisible ? "" : "none";
  if (btn) btn.textContent = mapTableVisible ? "▾ Ocultar dados" : "▸ Mostrar dados";
}

function refreshMapChart() {
  const chart = charts["mapbars"];
  if (!chart) return;
  const profile = getActiveProfile();
  if (!profile) return;
  if (mapSort.col !== 'games' && !profile.metrics.includes(mapSort.col)) {
    mapSort.col = dashboardMetricTab || profile.metrics[0] || 'games';
    mapSort.dir = (mapSort.col === 'kpd' || mapSort.col === 'position') ? 'asc' : 'desc';
  }
  const mapAgg = computeMapAgg(getMapPerformanceMatches(profile), profile.metrics);
  const sortCol = mapSort.col;
  const mapArr = Object.entries(mapAgg).map(([map, s]) => ({ map, games: s.games, kd: s.kd, kpm: s.kpm, kpd: s.kpd }));
  mapArr.sort((a, b) => { const valA = a[sortCol]; const valB = b[sortCol]; return mapSort.dir === 'desc' ? valB - valA : valA - valB; });
  const vals = mapArr.map(m => m[sortCol]);
  const sortColor = METRIC_COLORS[sortCol] || 'var(--brand)';
  const sortHex = getComputedStyle(document.documentElement).getPropertyValue(sortColor.replace('var(','').replace(')','')).trim() || '#00e5ff';
  const partidasLabel = 'Partidas';
  chart.data.labels = mapArr.map(m => m.map);
  chart.data.datasets[0].label = sortCol === 'games' ? partidasLabel : (METRIC_MAP[sortCol]?.label || sortCol.toUpperCase());
  chart.data.datasets[0].data = vals;
  chart.data.datasets[0].backgroundColor = mapArr.map(m => !dashboardMapFilter || m.map === dashboardMapFilter ? sortHex + "d9" : sortHex + "33");
  chart.data.datasets[0].borderColor = mapArr.map(m => !dashboardMapFilter || m.map === dashboardMapFilter ? sortHex : sortHex + "44");

  chart.options.plugins.datalabels.color = sortHex; chart.options.scales.y.suggestedMax = Math.max(...vals) * 1.12; chart.data.labels = mapArr.map((m, i) => mapRankVisible ? `${i + 1}º ${m.map}` : m.map);

  const goalValue = getMapGoalValue(mapSort.col, activeProfileId);
  if (!chart.options.plugins.mapGoalLine) chart.options.plugins.mapGoalLine = {};
  chart.options.plugins.mapGoalLine.enabled = goalValue !== null && goalValue > 0 && mapGoalVisible;
  chart.options.plugins.mapGoalLine.goalValue = goalValue;
  chart.options.plugins.mapGoalLine.color = sortHex + '33';
  chart._mapArr = mapArr;
  chart._sortCol = sortCol;
  chart.update();
  refreshMapAmplitude();
  const mapTableHead = document.getElementById("mapTableHead");
  if (mapTableHead) mapTableHead.innerHTML = buildMapTableHeadHtml(mapArr, profile.metrics);
}

function sortMapTable(col) {
  if (col !== 'games') {
    setDashboardMetricTab(col);
    return;
  }
  if (mapSort.col === col) {
    mapSort.dir = mapSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    mapSort.col = col;
    mapSort.dir = 'desc';
  }
  refreshMapChart();
}

function setEvolutionTab(tab) {
  setDashboardMetricTab(tab);
}

function refreshEvolutionIndicator() {
  const evContainer = document.getElementById("evolution-indicator");
  if (!evContainer) return;
  const profile = getActiveProfile();
  if (!profile) { evContainer.innerHTML = ""; return; }
  const mid = dashboardMetricTab || evolutionTab;
  const isInverted = mid === 'kpd' || mid === 'position';
  const allMatches = getDashboardMatches(profile);
  const evData = calcAdaptiveEvolution(allMatches, mid, isInverted);
  const variant = dashboardRecords === null ? 'geral' : 'recorte';
  evContainer.innerHTML = `<div>${formatEvolution(evData, variant)}</div>`;
}

function refreshEvolutionChart() {
  const chart = charts["evolution"];
  if (!chart) return;
  const profile = getActiveProfile();
  if (!profile) return;
  const mid = dashboardMetricTab || evolutionTab;
  const evoMatches = getDashboardMatches(profile);
  const labels = evoMatches.map(r => r.match_number);
  const vals = evoMatches.map(r => r[mid] ?? 0);
  const hexColor = getComputedStyle(document.documentElement).getPropertyValue(METRIC_COLORS[mid].replace('var(','').replace(')','')).trim() || '#b388ff';
  const maVals = movingAverage(vals, 10);
  const hasRecordDots = mid in RECORD_METRICS;
  const isInvertedMetric = RECORD_METRICS[mid] || false;
  chart.data.labels = labels;
  chart.data.datasets[0].data = vals;
  chart.data.datasets[0].label = METRIC_MAP[mid].label;
  chart.data.datasets[0].borderColor = hexColor;
  chart.data.datasets[0].backgroundColor = hexColor + "0d";
  chart.data.datasets[1].data = maVals;
  chart.data.datasets[1].borderColor = hexColor;
  chart._hasRecordDots = hasRecordDots;
  chart._hexColor = hexColor;
  chart._matchesUsed = evoMatches;
  chart.options.plugins.recordDots = { enabled: hasRecordDots && recordDotsVisible, inverted: isInvertedMetric };
  chart.options.scales.y.suggestedMax = Math.max(...vals.filter(v => v > 0).sort((a, b) => a - b).slice(0, Math.ceil(vals.length * 0.95))) || 5;
  chart.update();
}

function toggleRecordDots() {
  recordDotsVisible = !recordDotsVisible;
  localStorage.setItem('gt_recordDots', recordDotsVisible);
  const chart = charts["evolution"];
  if (chart) {
    chart._recordDotsVisible = recordDotsVisible;
    chart.options.plugins.recordDots.enabled = recordDotsVisible;
    chart.update();
  }
}

function openMetricsPopover(anchorEl) {
  closeFilterPopover();
  let popover = document.getElementById('filter-popover');
  if (!popover) {
    popover = document.createElement('div');
    popover.id = 'filter-popover';
    document.body.appendChild(popover);
  }
  const profile = getActiveProfile();
  let html = `<div class="filter-popover-title">Métricas Visíveis</div>`;
  ALL_METRICS.forEach(m => {
    const isChecked = profile.metrics.includes(m.id);
    html += `<label class="filter-popover-opt metric-popover-row" style="cursor:pointer;">
      <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleMetricVisibility('${m.id}', this.checked)" style="accent-color:var(--brand);cursor:pointer;">
      <span>${m.label}${m.type === 'calc' ? ' (calculada)' : ''}</span>
    </label>`;
  });
  html += `<div class="filter-popover-actions">
    <button class="filter-popover-btn" onclick="closeFilterPopover()">Fechar</button>
  </div>`;
  popover.innerHTML = html;
  popover.classList.add('open');
  const rect = anchorEl.getBoundingClientRect();
  popover.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  popover.style.left = (rect.left + window.scrollX) + 'px';
  activeFilterPopover = 'metrics';
  setTimeout(() => {
    document.addEventListener('click', closeFilterPopoverOutside, { once: true });
  }, 0);
}

function toggleMetricVisibility(metricId, visible) {
  const profile = getActiveProfile();
  if (!profile) return;
  if (visible) {
    if (!profile.metrics.includes(metricId)) {
      profile.metrics.push(metricId);
    }
  } else {
    profile.metrics = profile.metrics.filter(m => m !== metricId);
  }
  saveState();
  if (!visible && metricId === dashboardMetricTab) {
    dashboardMetricTab = resolveDashboardMetricTab(profile);
    if (dashboardMetricTab) {
      mapSort.col = dashboardMetricTab;
      mapSort.dir = (dashboardMetricTab === 'kpd' || dashboardMetricTab === 'position') ? 'asc' : 'desc';
      evolutionTab = dashboardMetricTab;
    }
  }
  renderDashboard();
  renderLog();
  showToast(visible ? `✓ ${METRIC_MAP[metricId]?.label || metricId} ativada` : `✗ ${METRIC_MAP[metricId]?.label || metricId} oculta`);
}