/* Nome e Local do Ficheiro: js/utils.js */

/* ============================================================
   FUNÇÕES UTILITÁRIAS
   Funções pequenas que fazem uma tarefa só e não renderizam
   nada na tela. São chamadas por outras funções.
   Ex: cálculo de média móvel, leitura de perfil, salvar
   estado, exportar, importar, toast, salvar meta.
   ============================================================ */
function movingAverage(values, period) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    result.push(+(avg).toFixed(2));
  }
  return result;
}

function formatDuration(minutes) {
  const totalSeconds = Math.round((parseFloat(minutes) || 0) * 60);
  if (totalSeconds <= 0) return "0min";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h > 0) parts.push(h + "h");
  if (m > 0) parts.push(m + "min");
  if (s > 0) parts.push(s + "s");
  return parts.length ? parts.join(" ") : "0min";
}

function getProfile(id) { return state.profiles.find(p => p.id === (id || activeProfileId)) || null; }
function getActiveProfile() { return getProfile(activeProfileId); }

function loadState() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) {
      const defaultState = buildDefaultState();
      defaultState.profiles.push(JSON.parse(JSON.stringify(DEMO_PROFILE_DATA)));
      defaultState.activeProfileId = '__demo__';
      return defaultState;
    }

    const parsed = JSON.parse(raw);

    // Validação 1: estrutura raiz
    if (!parsed || !Array.isArray(parsed.profiles)) {
      console.warn("loadState: estrutura raiz inválida. Resetando.");
      return buildDefaultState();
    }

    if (parsed.activeProfileId !== null && typeof parsed.activeProfileId !== 'string') {
      console.warn("loadState: activeProfileId inválido. Resetando.");
      return buildDefaultState();
    }

    // Validação 2: cada perfil individualmente
    for (const p of parsed.profiles) {
      if (!p || typeof p.id !== 'string' || !p.id) {
        console.warn("loadState: perfil sem id válido. Resetando.", p);
        return buildDefaultState();
      }
      if (typeof p.game !== 'string' || !p.game) {
        console.warn("loadState: perfil sem game válido. Resetando.", p.id);
        return buildDefaultState();
      }
      if (!Array.isArray(p.metrics)) {
        console.warn("loadState: perfil sem metrics válido. Resetando.", p.id);
        return buildDefaultState();
      }
      if (!Array.isArray(p.maps)) {
        console.warn("loadState: perfil sem maps válido. Resetando.", p.id);
        return buildDefaultState();
      }
      if (!Array.isArray(p.matches)) {
        console.warn("loadState: perfil sem matches válido. Resetando.", p.id);
        return buildDefaultState();
      }

      // Validação 3: cada partida individualmente
      for (const m of p.matches) {
        if (!m || typeof m.map !== 'string') {
          console.warn("loadState: partida com map inválido no perfil", p.id, m);
          return buildDefaultState();
        }
      }
    }

    // Normaliza ordenação cronológica e match_number
    for (const p of parsed.profiles) {
      normalizeProfileMatches(p);
      
      // Garante ordem alfabética dos mapas em perfis antigos
      if (Array.isArray(p.maps)) {
        p.maps.sort((a, b) => a.localeCompare(b, 'pt-BR'));
      }
    }

    // Injeta demo se não houver perfis reais (primeiro acesso ou tudo foi limpo)
    if (!parsed.profiles.some(p => !p.isDemo)) {
      parsed.profiles.push(JSON.parse(JSON.stringify(DEMO_PROFILE_DATA)));
      parsed.activeProfileId = '__demo__';
    }
    return parsed;

  } catch (e) {
    logStructuredError({ level: 'WARN', operation: 'loadState', message: 'Erro ao ler localStorage. Resetando.', context: { error: e.message } });
    return buildDefaultState();
  }
}
function saveState() {
  const stateToSave = {
    ...state,
    profiles: state.profiles.filter(p => !p.isDemo)
  };
  localStorage.setItem(getStorageKey(), JSON.stringify(stateToSave));
}

function injectDemoProfile() {
  const hasRealProfiles = state.profiles.some(p => !p.isDemo);
  if (hasRealProfiles) return false;
  const alreadyHasDemo = state.profiles.some(p => p.id === '__demo__');
  if (alreadyHasDemo) return false;
  state.profiles.push(JSON.parse(JSON.stringify(DEMO_PROFILE_DATA)));
  activeProfileId = '__demo__';
  state.activeProfileId = '__demo__';
  return true;
}

function removeDemoProfile() {
  state.profiles = state.profiles.filter(p => !p.isDemo);
  if (activeProfileId === '__demo__') {
    activeProfileId = state.profiles[0]?.id || null;
    state.activeProfileId = activeProfileId;
  }
}

function buildDefaultState() {
  return {
    activeProfileId: null,
    profiles: []
  };
}

function buildMatch(values, metrics, profile) {
  const m = { map: values.map || "", notes: values.notes || "" };
  const k = parseFloat(values.kills) || 0;
  const d = parseFloat(values.deaths) || 0;
  const t = parseFloat(values.time) || 0;
  if (metrics.includes("kills"))    m.kills    = k;
  if (metrics.includes("deaths"))   m.deaths   = d;
  if (metrics.includes("time"))     m.time     = t;
  if (metrics.includes("points"))   { const v = parseFloat(values.points);   if (!isNaN(v)) m.points = v; }
  if (metrics.includes("damage"))   { const v = parseFloat(values.damage);   if (!isNaN(v)) m.damage = v; }
  if (metrics.includes("assists"))  { const v = parseFloat(values.assists);  if (!isNaN(v)) m.assists = v; }
  if (metrics.includes("position")) { const v = parseFloat(values.position); if (!isNaN(v)) m.position = v; }
  if (metrics.includes("kd"))       m.kd       = d > 0 ? +(k/d).toFixed(2) : k;
  if (metrics.includes("kpm"))      m.kpm      = t > 0 ? +(k/t).toFixed(2) : 0;
  if (metrics.includes("kpd"))      m.kpd      = t > 0 ? +(d/t).toFixed(2) : 0;
  
  // CORREÇÃO: match_number baseado no array ordenado por data
  const existingMatches = profile ? profile.matches : [];
  
  // Ordenar temporariamente para calcular o número correto
  const sortedForCalc = [...existingMatches].sort((a, b) => {
    const dateA = a.match_date ? new Date(a.match_date).getTime() : 0;
    const dateB = b.match_date ? new Date(b.match_date).getTime() : 0;
    return dateA - dateB;
  });
  
  const maxNum = sortedForCalc.reduce((max, match) => {
    const num = parseInt(match.match_number);
    return !isNaN(num) && num > max ? num : max;
  }, 0);
  m.match_number = maxNum + 1;
  
  // match_date da partida em UTC real — formatDate/toLocalDate/toLocalTime convertem para local
  m.match_date = new Date().toISOString();
  
  return m;
}

function normalizeProfileMatches(profile) {
  if (!profile || !Array.isArray(profile.matches) || profile.matches.length === 0) return;
  
  // Ordena por match_date (mais antiga primeiro). Partidas sem data vão para o final.
  profile.matches.sort((a, b) => {
    const timeA = a.match_date ? new Date(a.match_date).getTime() : Infinity;
    const timeB = b.match_date ? new Date(b.match_date).getTime() : Infinity;
    return timeA - timeB;
  });
  
  // Reatribui match_number sequencial baseado na ordem cronológica
  profile.matches.forEach((m, idx) => {
    m.match_number = idx + 1;
  });
}

function profileLabel(p) { return [p.game, p.mode, p.server].filter(Boolean).join(" · "); }

function saveGoal(key, val) {
  const v = parseFloat(val);
  if (!isNaN(v) && v > 0) {
    localStorage.setItem(key, v);
    showToast(`✓ Meta definida: ${v}`);
  } else {
    localStorage.removeItem(key);
    showToast(`✓ Meta removida`);
  }
  updateKpiProgress(key, isNaN(v) ? 0 : v);
  const parts = key.replace("goal_", "").split("_");
  const profileId = parts[parts.length - 1];
  const metricId = parts.slice(0, parts.length - 1).join("_");
  syncToCloud("upsert_goal", { profileId, metricId, value: isNaN(v) ? 0 : v });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
}

function toLocalDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function toLocalTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const norm = s => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return norm(a) === norm(b);
}

function mapInList(mapName, mapList) {
  if (!Array.isArray(mapList)) return false;
  return mapList.some(m => mapEquals(mapName, m));
}

function showToast(msg) {  const t=document.getElementById("toast"); t.textContent=msg; t.style.display="block";
  clearTimeout(t._timer); t._timer=setTimeout(()=>{t.style.display="none";},2400);
}


