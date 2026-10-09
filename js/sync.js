/* Nome e Local do Ficheiro: js/sync.js */

/* ============================================================
   SINCRONIZAÇÃO SUPABASE
   Envia e recebe dados do banco quando o usuário está logado.
   ============================================================ */

async function syncMissingProfilesToCloud() {
  if (!supabaseClient || !currentUser) return;
  
  for (const profile of state.profiles) {
    if (profile.cloudId) continue; // Já existe na nuvem
    
    // ─── VERIFICA SE FOI DELETADO NA NUVEM ANTES DE RECRIAR ───
    const { data: existingDeleted, error: checkErr } = await supabaseClient
      .from("game_profiles")
      .select("id, deleted")
      .eq("user_id", currentUser.id)
      .eq("local_id", profile.id)
      .maybeSingle();
    
    if (!checkErr && existingDeleted) {
      if (existingDeleted.deleted) {
        // Registro deletado na nuvem com mesmo local_id: gera novo ID local
        // para evitar conflito e permitir que o perfil seja recriado como novo
        console.warn(`[SYNC] Perfil ${profile.game} (local_id ${profile.id}) colide com registro deletado na nuvem. Gerando novo local_id.`);
        profile.id = "p" + Date.now() + Math.random().toString(36).substr(2, 5);
        saveState();
        continue;
      } else {
        // Existe e não está deletado — vincula cloudId sem recriar
        profile.cloudId = existingDeleted.id;
        saveState();
        continue;
      }
    }
    
    console.log(`[SYNC] Criando perfil na nuvem: ${profile.game} ${profile.mode || ''} ${profile.server || ''}`);
    
    try {
      const { data, error } = await supabaseClient
        .from("game_profiles")
        .upsert({
          user_id: currentUser.id,
          local_id: profile.id,
          game: profile.game,
          mode: profile.mode,
          server: profile.server,
          maps: profile.maps,
          metrics: profile.metrics,
          deleted: false,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id,local_id" })
        .select();
      
      if (error) {
        console.error(`[SYNC] Erro ao criar perfil ${profile.game}:`, error);
        continue;
      }
      
      if (data && data.length > 0) {
        profile.cloudId = data[0].id;
        console.log(`[SYNC] Perfil criado na nuvem. cloudId: ${profile.cloudId}`);
      }
    } catch (e) {
      console.error(`[SYNC] Exceção ao criar perfil ${profile.game}:`, e);
    }
  }
  
  saveState();
}

function hasOfflineData() {
  try {
    const raw = localStorage.getItem("gt_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.profiles)) return null;
    // Agora detecta perfis, nao apenas partidas
    if (parsed.profiles.length === 0) return null;
    return parsed;
  } catch (e) {
    console.error("Erro ao ler dados offline:", e);
    return null;
  }
}

let offlineMergeChecked = false;

async function checkOfflineMerge() {
  if (offlineMergeChecked) return;
  if (!currentUser) return;
  const offlineData = hasOfflineData();
  if (!offlineData) return;
  
  
  if (document.getElementById("modal-overlay").classList.contains("open")) {
    setTimeout(() => checkOfflineMerge(), 1000);
    return;
  }
  offlineMergeChecked = true;
  showOfflineMergeModal(offlineData);
}


function declineOfflineMerge() {
  closeModal();
  delete window._pendingOfflineMerge;
  showToast("✓ Dados locais preservados. Eles reaparecerão quando você deslogar.");
}



// Verifica se o usuário logado já tem dados no Supabase
async function hasCloudData() {
  if (!supabaseClient || !currentUser) {
    console.log("hasCloudData: offline");
    return false;
  }
  try {
    const { data, error } = await supabaseClient
      .from("game_profiles")
      .select("id,local_id,deleted")
      .eq("user_id", currentUser.id);
    if (error) {
      console.error("Erro ao verificar dados na nuvem:", error);
      return false;
    }
    
    // Verifica se os cloudIds locais ainda existem na nuvem e se foram deletados
    const cloudMap = new Map((data || []).map(p => [p.id, p.deleted]));
    
    // Remove perfis locais que foram deletados na nuvem por outro dispositivo
    const beforeCount = state.profiles.length;
    const removedNames = [];
    const removedProfiles = [];
    state.profiles = state.profiles.filter(lp => {
      if (lp.cloudId && cloudMap.has(lp.cloudId) && cloudMap.get(lp.cloudId) === true) {
        console.warn(`[SYNC] cloudId ${lp.cloudId} do perfil ${lp.game} está deletado na nuvem. Removendo perfil local.`);
        removedNames.push(lp.game);
        
        removedProfiles.push(lp);
        // Limpa metas do perfil do localStorage
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith("goal_") && key.endsWith(`_${lp.id}`)) {
            localStorage.removeItem(key);
          }
        }
        return false;
      }
      return true;
    });
    
    // ─── BACKUP DE EMERGÊNCIA (Regra 31) ───
    if (removedProfiles.length > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupState = {
        _backup_reason: "hasCloudData_removed_orphans",
        _backup_timestamp: new Date().toISOString(),
        removed_profiles: removedProfiles,
        remaining_profiles: state.profiles
      };
      const blob = new Blob([JSON.stringify(backupState, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `aimdata-orphan-backup-${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      console.log(`[BACKUP] Backup de ${removedProfiles.length} perfil(is) órfão(s) baixado.`);
    }
    
   
    if (state.profiles.length < beforeCount) {
      saveState();
      // Se o perfil ativo foi removido, ajusta
      if (activeProfileId && !state.profiles.find(p => p.id === activeProfileId)) {
        activeProfileId = state.profiles[0]?.id || null;
        state.activeProfileId = activeProfileId;
      }
      if (removedNames.length > 0) {
        showToast(`🗑 ${removedNames.join(", ")} removido(s) — deletado em outro dispositivo`);
      }
    }
    
    const hasData = data && data.length > 0;
    console.log("hasCloudData:", hasData ? `tem ${data.length} perfis` : "vazio");
    return hasData;
  } catch (e) {
    console.error("Exceção em hasCloudData:", e);
    return false;
  }
}

// Envia todos os dados do localStorage para o Supabase
async function uploadLocalData() {
  if (!supabaseClient || !currentUser) { showToast("⚠ Não está logado"); return false; }
  showToast("☁ Enviando dados para a nuvem...");
  try {
    for (const profile of state.profiles) {

      // 1. Upsert do perfil usando local_id como chave de conflito
      let { data: profileData, error: profileError } = await supabaseClient
        .from("game_profiles")
        .upsert({
          user_id: currentUser.id,
          local_id: profile.id,
          game: profile.game,
          mode: profile.mode,
          server: profile.server,
          maps: profile.maps,
          metrics: profile.metrics,
          next_id: profile.nextId,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "user_id,local_id"
        })
        .select();
      if (profileError) {
        console.error("Erro ao upsert perfil:", profileError);
        throw profileError;
      }
      let cloudProfileId;
      if (!profileData || profileData.length === 0) {
        console.warn("Upsert retornou vazio, buscando perfil existente...");
        const { data: existingProfile, error: findError } = await supabaseClient
          .from("game_profiles")
          .select("id")
          .eq("user_id", currentUser.id)
          .eq("local_id", profile.id)
          .single();
        if (findError) throw findError;
        cloudProfileId = existingProfile.id;
      } else {
        cloudProfileId = profileData[0].id;
      }

      // Vincula o ID da nuvem ao perfil local para sync automático
      const localProfile = state.profiles.find(lp => lp.id === profile.id);




      if (localProfile) {
        localProfile.cloudId = cloudProfileId;
      }

      // 2. Upsert das partidas (chave composta id + profile_id já garante unicidade)
      if (profile.matches.length > 0) {
        const matchesToInsert = profile.matches.map(m => ({
          ...(m.id && typeof m.id === 'string' && !m.id.startsWith('m') ? { id: m.id } : {}),
          profile_id: cloudProfileId,
          map: m.map,
          kills: m.kills ?? null,
          deaths: m.deaths ?? null,
          time: m.time ?? null,
          points: m.points ?? null,
          damage: m.damage ?? null,
          assists: m.assists ?? null,
          position: m.position ?? null,
          kd: m.kd ?? null,
          kpm: m.kpm ?? null,
          kpd: m.kpd ?? null,
          notes: m.notes ?? null,
          match_number: m.match_number ?? null,
          match_date: m.match_date ?? null,
          updated_at: m.updated_at || new Date().toISOString()
        }));
        const { data: insertedMatches, error: matchesError } = await supabaseClient
          .from("matches")
          .upsert(matchesToInsert, { onConflict: "id" })
          .select("id");
        if (matchesError) throw matchesError;
        insertedMatches.forEach((row, i) => {
          profile.matches[i].id = row.id;
        });
        saveState();
      }

      // 3. Upsert das metas (unique profile_id + metric_id já existe no banco)
      const goalsToUpsert = [];
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("goal_") && key.endsWith("_" + profile.id)) {
          const metricId = key.replace("goal_", "").replace("_" + profile.id, "");
          const val = parseFloat(localStorage.getItem(key));
          if (!isNaN(val) && val > 0) {
            goalsToUpsert.push({
              profile_id: cloudProfileId,
              metric_id: metricId,
              target_value: val
            });
          }
        }
      }
      if (goalsToUpsert.length > 0) {
        const { error: goalsError } = await supabaseClient
          .from("goals")
          .upsert(goalsToUpsert, { onConflict: "profile_id,metric_id" });
        if (goalsError) throw goalsError;
      }
    }
    showToast("✓ Dados salvos na nuvem!");
    return true;
  } catch (e) {
    console.error("Erro ao enviar dados:", e);
    showToast("⚠ Erro ao enviar dados. Tente novamente.");
    return false;
  }
}

// Sincronização automática em segundo plano — chamada após cada operação

async function syncProfileToCloud(profile) {
  if (!supabaseClient || !currentUser) return;
  try {
    const { data: profileData, error } = await supabaseClient
      .from("game_profiles")
      .upsert({
        user_id: currentUser.id,
        local_id: profile.id,
        game: profile.game,
        mode: profile.mode,
        server: profile.server,
        maps: profile.maps,
        metrics: profile.metrics,
        next_id: profile.nextId,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id,local_id" })
      .select()
      .single();
    if (error) throw error;
    profile.cloudId = profileData.id;
    saveState();
    showToast("☁ Perfil sincronizado");
  } catch (e) {
    console.error("Erro ao sincronizar perfil:", e);
    showToast(`⚠ Sync do perfil falhou: ${e?.message || "erro desconhecido"}`);
  }
}

async function syncToCloud(operation, data) {
  if (!supabaseClient || !currentUser) {
    console.log("syncToCloud: offline (sem supabase ou usuário)");
    return null;
  }
  try {
    let cloudProfileId = null;
    const profile = getProfile(data.profileId);
    // Caminho rápido: já temos o ID da nuvem cacheado localmente
    if (profile?.cloudId) {
      cloudProfileId = profile.cloudId;
    } else {
      // Fallback: busca por local_id (para dados antigos ou primeiro sync)
      const { data: profileData, error: profileError } = await supabaseClient
        .from("game_profiles")
        .select("id")
        .eq("user_id", currentUser.id)
        .eq("local_id", data.profileId)
        .single();
      if (profileError || !profileData) throw new Error("Perfil não encontrado na nuvem.");
      cloudProfileId = profileData.id;
      profile.cloudId = cloudProfileId; // vincula para nunca mais precisar buscar
    }

    if (operation === "upsert_match") {
      const matchPayload = {
        profile_id: cloudProfileId,
        map: data.match.map,
        kills: data.match.kills ?? null,
        deaths: data.match.deaths ?? null,
        time: data.match.time ?? null,
        points: data.match.points ?? null,
        damage: data.match.damage ?? null,
        assists: data.match.assists ?? null,
        position: data.match.position ?? null,
        kd: data.match.kd ?? null,
        kpm: data.match.kpm ?? null,
        kpd: data.match.kpd ?? null,
        notes: data.match.notes ?? null,
        match_number: data.match.match_number ?? null,
        match_date: data.match.match_date ?? null,
        updated_at: new Date().toISOString()
      };
      // Só envia o ID se for um UUID do Supabase (não um ID local "m...")
      if (data.match.id && typeof data.match.id === 'string' && !data.match.id.startsWith('m')) {
        matchPayload.id = data.match.id;
      }
      const { data: insertedMatch, error } = await supabaseClient
        .from("matches")
        .upsert(matchPayload, { onConflict: "id" })
        .select("id")
        .single();
      if (error) throw error;
      if (!insertedMatch || !insertedMatch.id) throw new Error("Banco não confirmou a partida");
      return insertedMatch.id;
      
    } else if (operation === "upsert_matches") {
      // Envia várias partidas num único upsert => uma só transação.
      // Com a constraint DEFERRABLE, a checagem de unicidade ocorre no commit,
      // permitindo trocas de match_number sem colisão temporária (409).
      const cloudMatches = (data.matches || []).filter(
        m => m && m.id && typeof m.id === 'string' && !m.id.startsWith('m')
      );
      if (cloudMatches.length === 0) return [];
      const payload = cloudMatches.map(m => ({
        id: m.id,
        profile_id: cloudProfileId,
        map: m.map,
        kills: m.kills ?? null,
        deaths: m.deaths ?? null,
        time: m.time ?? null,
        points: m.points ?? null,
        damage: m.damage ?? null,
        assists: m.assists ?? null,
        position: m.position ?? null,
        kd: m.kd ?? null,
        kpm: m.kpm ?? null,
        kpd: m.kpd ?? null,
        notes: m.notes ?? null,
        match_number: m.match_number ?? null,
        match_date: m.match_date ?? null,
        updated_at: new Date().toISOString()
      }));
      const { data: rows, error } = await supabaseClient
        .from("matches")
        .upsert(payload, { onConflict: "id" })
        .select("id");
      if (error) throw error;
      return rows;

    } else if (operation === "delete_match") {
      if (data.matchId && typeof data.matchId === 'string' && data.matchId.startsWith('m')) {
        return null;
      }
      const { data: deletedMatch, error } = await supabaseClient
        .from("matches")
        .delete()
        .eq("id", data.matchId)
        .eq("profile_id", cloudProfileId)
        .select()
        .single();
      if (error) throw error;
      if (!deletedMatch) throw new Error("Partida não encontrada para deletar na nuvem");
      showToast("☁ Partida removida da nuvem");
    } else if (operation === "delete_matches") {
      // Remove várias partidas em lotes. Devolve as linhas efetivamente apagadas.
      // Array = sem erro (mesmo que menos linhas que o pedido, ex.: já apagadas antes).
      const idsToDelete = (data.matchIds || []).filter(
        id => typeof id === 'string' && !id.startsWith('m')
      );
      if (idsToDelete.length === 0) return [];
      const BATCH_SIZE = 50;
      const deletedAll = [];
      for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const batch = idsToDelete.slice(i, i + BATCH_SIZE);
        const { data: deletedRows, error } = await supabaseClient
          .from("matches")
          .delete()
          .in("id", batch)
          .eq("profile_id", cloudProfileId)
          .select("id");
        if (error) throw error;
        deletedAll.push(...(deletedRows || []));
      }
      return deletedAll;
    } else if (operation === "upsert_goal") {
      if (data.value > 0) {
        const { data: goalData, error } = await supabaseClient
          .from("goals")
          .upsert({ profile_id: cloudProfileId, metric_id: data.metricId, target_value: data.value },
            { onConflict: "profile_id,metric_id" })
          .select()
          .single();
        if (error) throw error;
        if (!goalData) throw new Error("Banco não confirmou a meta");
      } else {
        const { data: deletedGoals, error } = await supabaseClient
          .from("goals")
          .delete()
          .eq("profile_id", cloudProfileId)
          .eq("metric_id", data.metricId)
          .select();
        if (error) throw error;
      }
      showToast("☁ Meta sincronizada");
    }

    // Persiste o cloudId assim que é descoberto
    if (cloudProfileId && profile && !profile.cloudId) {
      profile.cloudId = cloudProfileId;
      saveState();
    } else if (profile && profile.cloudId) {
      saveState();
    }
  } catch (e) {
    logStructuredError({ level: 'ERROR', operation: 'syncToCloud', message: 'Erro na sincronização', context: { error: e?.message || e?.details || '', requestedOperation: operation } });
    const msg = e?.message || e?.details || "";
    const code = e?.code || "";
    
    // Erro 403 com "row-level security" = perfil não existe na nuvem ou não pertence ao usuário
    const isMissingProfile = msg.includes("row-level security") && msg.includes("matches");
    const isAuthError = msg.includes("JWT") || msg.includes("token") ||
      msg.includes("session") || msg.includes("401") || msg.includes("403");
    
    if (isMissingProfile && cloudProfileId) {
      // O cloudId está desatualizado. Invalida e tenta recriar o perfil na próxima.
      invalidateCloudId(data.profileId);
      showToast("⚠ Perfil não encontrado na nuvem. Reenviando...");
      // Tenta reenviar o perfil primeiro, depois a partida
      const profile = getProfile(data.profileId);
      if (profile) {
        syncProfileToCloud(profile).then(() => {
          // Após recriar o perfil, tenta a operação original novamente
          setTimeout(() => syncToCloud(operation, data), 500);
        });
      }
      return null;
    }
    
    if (isAuthError && !isMissingProfile) {
      currentUser = null;
      updateAuthButton();
      showToast("⚠ Sessão expirada. Faça login novamente.");
    } else {
      showToast(`⚠ Sync falhou: ${msg || "erro desconhecido"}`);
    }
  }
}

// Baixa todos os dados do Supabase e substitui o localStorage
async function downloadCloudData() {
  if (!supabaseClient || !currentUser) { showToast("⚠ Não está logado"); return false; }
  showToast("☁ Baixando dados da nuvem...");
  try {
    // 1. Busca perfis
    const { data: profiles, error: profilesError } = await supabaseClient
      .from("game_profiles")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("deleted", false);
    if (profilesError) throw profilesError;

    const newState = { activeProfileId: null, profiles: [] };

    for (const p of profiles) {
      // 2. Busca partidas do perfil
      const { data: matches, error: matchesError } = await supabaseClient
        .from("matches")
        .select("*")
        .eq("profile_id", p.id)
        .order("match_number", { ascending: true });
      if (matchesError) throw matchesError;

      // 3. Busca metas do perfil
      const { data: goals, error: goalsError } = await supabaseClient
        .from("goals")
        .select("*")
        .eq("profile_id", p.id);
      if (goalsError) throw goalsError;

      // Reconstrói o perfil no formato antigo
      const profile = {
        id: p.local_id || ("p" + Date.now() + Math.random().toString(36).substr(2, 5)),
        cloudId: p.id,
        game: p.game,
        mode: p.mode,
        server: p.server,
        maps: p.maps || [],
        metrics: p.metrics || [],
        nextId: p.next_id || 1,
        matches: (matches || []).map(m => ({
          id: m.id,
          map: m.map,
          kills: m.kills,
          deaths: m.deaths,
          time: m.time,
          points: m.points,
          damage: m.damage,
          assists: m.assists,
          position: m.position,
          kd: m.kd,
          kpm: m.kpm,
          kpd: m.kpd,
          notes: m.notes ?? "",
          match_number: m.match_number ?? null,
          match_date: m.match_date ?? null
        }))
      };

      // Restaura as metas no localStorage
      for (const g of (goals || [])) {
        localStorage.setItem(`goal_${g.metric_id}_${profile.id}`, g.target_value);
      }

      normalizeProfileMatches(profile);
      newState.profiles.push(profile);
    }

    if (newState.profiles.length > 0) {
      newState.activeProfileId = newState.profiles[0].id;
    }

    // Substitui o estado local
    state = newState;
    activeProfileId = newState.activeProfileId;
    saveState();
    refreshAll();
    showToast("✓ Dados sincronizados da nuvem!");
    return true;
  } catch (e) {
    console.error("Erro ao baixar dados:", e);
    showToast("⚠ Erro ao baixar dados. Tente novamente.");
    return false;
  }
}

// Funde dados da nuvem com dados locais sem apagar nenhum dos dois

async function uploadLocalOrphans() {
  if (!supabaseClient || !currentUser) return;
  
  for (const profile of state.profiles) {
    if (!profile.cloudId) {
      console.warn(`[SYNC] Pulando órfãos do perfil ${profile.game}: sem cloudId`);
      continue;
    }
    
    // Busca os IDs que JÁ EXISTEM na nuvem para este perfil
    const { data: cloudRows, error: fetchErr } = await supabaseClient
      .from("matches")
      .select("id")
      .eq("profile_id", profile.cloudId);
    
    if (fetchErr) {
      console.error(`[SYNC] Falha ao buscar IDs da nuvem para ${profile.game}:`, fetchErr.message);
      continue; // aborta este perfil; preserva local
    }
    
    const cloudIdSet = new Set((cloudRows || []).map(r => r.id));
    
    // Órfão = qualquer partida local cujo ID NÃO existe na nuvem
    // Cobre tanto IDs temporários "m..." quanto UUIDs herdados de outra conta
    const orphans = profile.matches.filter(m => {
      if (!m.id) return true; // sem ID = órfão
      return !cloudIdSet.has(String(m.id));
    });
    
    if (orphans.length === 0) continue;
    
    console.log(`Enviando ${orphans.length} órfãos do perfil ${profile.game} (nuvem tem ${cloudIdSet.size})...`);
    
    // Renumera match_number dos órfãos para o perfil de destino, evitando
    // colisão com idx_matches_profile_number (partidas já existentes na nuvem).
    // Usa a maior numeração entre nuvem e local como base.
    const existingNumbers = new Set();
    for (const r of (cloudRows || [])) { /* nuvem não traz match_number no select acima, mas mantemos o Set para futuro */ }
    let maxNum = 0;
    for (const m of profile.matches) {
      const n = parseInt(m.match_number);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
    for (const o of orphans) {
      maxNum += 1;
      o.match_number = maxNum;
    }
    saveState();
    
    const BATCH_SIZE = 25;
    for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
      const batch = orphans.slice(i, i + BATCH_SIZE);
      const payloads = batch.map(m => ({
        profile_id: profile.cloudId,
        map: m.map,
        kills: m.kills ?? null,
        deaths: m.deaths ?? null,
        time: m.time ?? null,
        points: m.points ?? null,
        damage: m.damage ?? null,
        assists: m.assists ?? null,
        position: m.position ?? null,
        kd: m.kd ?? null,
        kpm: m.kpm ?? null,
        kpd: m.kpd ?? null,
        notes: m.notes ?? null,
        match_number: m.match_number,
        match_date: m.match_date,
        updated_at: m.match_date || new Date().toISOString()
      }));
      
      try {
        const { data: inserted, error } = await supabaseClient
          .from("matches")
          .insert(payloads)
          .select("id");
          
        if (error) {
          console.error("Erro ao enviar órfãos:", error.message);
          // Se o erro é de RLS no matches, o perfil pode ter sido deletado da nuvem
          if (error.message && error.message.includes("row-level security")) {
            console.warn("[SYNC] Perfil pode estar desatualizado na nuvem. Invalidando cloudId...");
            invalidateCloudId(profile.id);
            // Tenta recriar o perfil e reenviar
            await syncProfileToCloud(profile);
            // Não continue — na próxima vez que uploadLocalOrphans rodar, o perfil estará correto
            break;
          }
          continue;
        }
        
        // Atualizar IDs locais
        inserted.forEach((row, idx) => {
          const original = batch[idx];
          const matchInProfile = profile.matches.find(m => m === original);
          if (matchInProfile) matchInProfile.id = row.id;
        });
        
      } catch (e) {
        console.error("Exceção ao enviar órfãos:", e.message);
      }
      
      if (i + BATCH_SIZE < orphans.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }
  
  saveState();
}

async function mergeCloudData() {
  if (!supabaseClient || !currentUser) return false;
  showToast("☁ Sincronizando dados...");
  try {
    // PRIMEIRO: garantir que todos os perfis locais existam na nuvem
    await syncMissingProfilesToCloud();
    
    // DEPOIS: enviar órfãos locais (agora com cloudId válido)
    await uploadLocalOrphans();
    
    const { data: profiles, error: profilesError } = await supabaseClient
      .from("game_profiles")
      .select("*")
      .eq("user_id", currentUser.id)
      .eq("deleted", false);
    if (profilesError) throw profilesError;

    for (const p of profiles) {
      const { data: matches, error: matchesError } = await supabaseClient
        .from("matches")
        .select("*")
        .eq("profile_id", p.id)
        .order("match_number", { ascending: true });
      if (matchesError) throw matchesError;

      const { data: goals, error: goalsError } = await supabaseClient
        .from("goals")
        .select("*")
        .eq("profile_id", p.id);
      if (goalsError) throw goalsError;

      // Preserva updated_at vindo da nuvem para comparação futura
      const cloudMatches = (matches || []).map(m => ({
        id: m.id, map: m.map, kills: m.kills, deaths: m.deaths,
        time: m.time, points: m.points, damage: m.damage,
        assists: m.assists, position: m.position, kd: m.kd,
        kpm: m.kpm, kpd: m.kpd, notes: m.notes ?? "",
        match_number: m.match_number ?? null,
        match_date: m.match_date ?? null,
        updated_at: m.updated_at || m.created_at
      }))

      const localProfile = state.profiles.find(lp => lp.id === p.local_id);

      if (localProfile) {
        // Monta índices para comparação eficiente
        const cloudById = new Map(cloudMatches.map(m => [m.id, m]));
        const localById = new Map(
          localProfile.matches
            .filter(m => typeof m.id === 'string' && !m.id.startsWith('m'))
            .map(m => [m.id, m])
        );

        const mergedMatches = [];

        // Para cada partida da nuvem, decide qual versão é mais recente
        for (const cloudMatch of cloudMatches) {
          const localMatch = localById.get(cloudMatch.id);
          if (!localMatch) {
            // Partida existe só na nuvem: usa a versão da nuvem
            mergedMatches.push(cloudMatch);
            continue;
          }
          const cloudTime = new Date(cloudMatch.updated_at || 0).getTime();
          const localTime = new Date(localMatch.updated_at || 0).getTime();
          if (localTime > cloudTime) {
            // Local é mais recente: envia para a nuvem e usa local
            syncToCloud("upsert_match", { profileId: localProfile.id, match: localMatch });
            mergedMatches.push(localMatch);
          } else {
            // Nuvem é mais recente ou igual: usa nuvem, mas preserva match_number local se a nuvem vier sem
            if ((cloudMatch.match_number === null || cloudMatch.match_number === undefined) && localMatch.match_number !== null) {
              cloudMatch.match_number = localMatch.match_number;
              cloudMatch.match_date = localMatch.match_date || cloudMatch.match_date;
            }
            mergedMatches.push(cloudMatch);
          }
        }

        // Partidas locais que ainda não chegaram à nuvem (ID temporário m...)

        const localOnlyMatches = localProfile.matches.filter(m =>
          typeof m.id === 'string' && m.id.startsWith('m')
        );

        localProfile.matches = [...mergedMatches, ...localOnlyMatches];
        normalizeProfileMatches(localProfile);
        localProfile.cloudId = p.id;

      } else {
        // Perfil só existe na nuvem: cria localmente
        const profile = {
          id: p.local_id || ("p" + Date.now() + Math.random().toString(36).substr(2, 5)),
          cloudId: p.id,
          game: p.game, mode: p.mode, server: p.server,
          maps: p.maps || [], metrics: p.metrics || [],
          matches: cloudMatches
        };
        for (const g of (goals || [])) {
          localStorage.setItem(`goal_${g.metric_id}_${profile.id}`, g.target_value);
        }
        state.profiles.push(profile);
      }
    }

    // ─── REMOÇÃO DE ÓRFÃOS: perfis deletados em outro dispositivo ───
    const cloudIds = new Set(profiles.map(p => p.id));
    const cloudLocalIds = new Set(profiles.map(p => p.local_id));
    const orphans = state.profiles.filter(lp => {
      // Se o perfil local tem cloudId mas esse ID não existe na nuvem → foi deletado
      if (lp.cloudId && !cloudIds.has(lp.cloudId)) return true;
      // Se o perfil local NÃO tem cloudId mas seu local_id existe na nuvem → já foi recriado, não é órfão
      if (!lp.cloudId && cloudLocalIds.has(lp.id)) return false;
      return false;
    });
    
    if (orphans.length > 0) {
      console.log(`[MERGE] Removendo ${orphans.length} perfil(is) deletado(s) na nuvem:`, orphans.map(p => p.game));
      state.profiles = state.profiles.filter(lp => {
        if (lp.cloudId && !cloudIds.has(lp.cloudId)) return false;
        return true;
      });
      showToast(`🗑 ${orphans.length} perfil(s) removido(s) — deletado em outro dispositivo`);
    }

    if (!state.activeProfileId && state.profiles.length > 0) {
      state.activeProfileId = state.profiles[0].id;
      activeProfileId = state.activeProfileId;
    }

    saveState();
    const activeTab = document.querySelector(".tab-btn.active");
    const tabs = ["dashboard","log","add","profiles"];
    const idx = [...document.querySelectorAll(".tab-btn")].indexOf(activeTab);
    const currentTab = tabs[idx] || "dashboard";
    if (currentTab !== "add") {
      refreshAll();
    } else {
      renderProfileSelector();
    }
    showToast("✓ Dados sincronizados!");
    return true;
  } catch (e) {
    logStructuredError({ level: 'ERROR', operation: 'mergeCloudData', message: 'Erro ao sincronizar', context: { error: e.message } });
    showToast("⚠ Erro ao sincronizar. Tente novamente.");
    return false;
  }
}



// Pergunta ao usuário o que fazer quando loga pela primeira vez

async function promptFirstSync() {
  try {
    const hasCloud = await hasCloudData();
    const hasLocal = state.profiles.length > 0 && state.profiles.some(p => p.matches.length > 0);

    // Sem nada para sincronizar — não faz nada
    if (!hasCloud && !hasLocal) {
      console.log("Nenhum dado local ou na nuvem para sincronizar.");
      return;
    }

    // Usuário já tem dados na nuvem e não tem nada local — baixa silenciosamente
    // (não há risco de perda de dados locais)
    if (hasCloud && !hasLocal) {
      const downloaded = await downloadCloudData();
      if (!downloaded) {
        showToast("⚠ Falha ao baixar dados da nuvem.");
      }
      return;
    }

    // Usuário já aceitou ou já sincronizou antes — faz merge silencioso
    const jaConsentiu = localStorage.getItem("sync_consented") === "true";
    if (jaConsentiu) {
      const merged = await mergeCloudData();
      if (!merged) {
        showToast("⚠ Falha ao sincronizar. Seus dados locais estão seguros.");
      }
      return;
    }

    // Primeira vez com dados locais — exige consentimento
    showSyncConsentModal(hasCloud);

  } catch (e) {
    console.error("Erro em promptFirstSync:", e);
    showToast("⚠ Erro na sincronização automática. Use o botão ☁ Sync manualmente.");
  }
}

function showSyncConsentModal(hasCloud) {
  // Fecha qualquer modal aberto
  closeModal();

  document.getElementById("modal-title").textContent = "Salvar seus dados na nuvem?";
  document.getElementById("modal-body").innerHTML = `
    <p style="font-size:13px;color:var(--sub);line-height:1.7;margin-bottom:16px;">
      Ao confirmar, seus perfis, partidas e metas serão enviados com segurança para os servidores do AimData.
    </p>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <span style="color:var(--confirm);font-size:14px;flex-shrink:0;">✓</span>
        <span style="font-size:13px;color:var(--text);">Acesse seus dados em qualquer dispositivo</span>
      </div>
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <span style="color:var(--confirm);font-size:14px;flex-shrink:0;">✓</span>
        <span style="font-size:13px;color:var(--text);">Recupere tudo se trocar de navegador ou computador</span>
      </div>
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <span style="color:var(--confirm);font-size:14px;flex-shrink:0;">✓</span>
        <span style="font-size:13px;color:var(--text);">Nunca perca uma partida registrada por falha local</span>
      </div>
    </div>
    <p style="font-size:12px;color:var(--muted);line-height:1.6;">
      Se preferir decidir depois, use o botão <strong style="color:var(--action);">Sync</strong> a qualquer momento.
    </p>
  `;
  document.getElementById("modal-actions").innerHTML = `
    <button class="modal-cancel" onclick="recusarSync()">Agora não</button>
    <button class="modal-save" onclick="aceitarSync(${hasCloud})">Salvar na nuvem</button>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

function showNewOfflineProfilesModal(newProfiles, duplicates, offlineData) {
  closeModal();
  offlineMergeChecked = true; // evita que qualquer timer antigo interfira

  const allProfiles = [...newProfiles, ...duplicates];
  const totalMatches = allProfiles.reduce((sum, p) => sum + (p.matches?.length || 0), 0);
  const profileNames = allProfiles.map(p => profileLabel(p)).join(", ");

  document.getElementById("modal-title").textContent = "Dados salvos sem login encontrados";
  document.getElementById("modal-body").innerHTML = `
    <p style="font-size:13px;color:var(--sub);line-height:1.7;margin-bottom:16px;">
      Encontramos ${totalMatches} partida(s) salva(s) neste navegador sem estar logado, no(s) perfil(is): <strong style="color:var(--text);">${profileNames}</strong>.
    </p>
    <p style="font-size:13px;color:var(--sub);line-height:1.7;margin-bottom:16px;">
      Deseja incorporar esses dados à sua conta atual? Se já existir um perfil igual (mesmo jogo/modo/servidor), as partidas serão adicionadas a ele. Nenhuma partida existente na conta será apagada ou sobrescrita.
    </p>
  `;
  document.getElementById("modal-actions").innerHTML = `
    <button class="modal-cancel" onclick="declineOfflineMerge()">Não, ignorar</button>
    <button class="modal-save" id="btn-incorporar" onclick="this.disabled=true;this.textContent='Incorporando...';proceedOfflineMerge()">Sim, incorporar à conta</button>
  `;
  document.getElementById("modal-overlay").classList.add("open");

  window._pendingOfflineMerge = {
    stage: 'consent',
    newProfiles: newProfiles || [],
    duplicates: duplicates || [],
    offlineData: offlineData
  };
}

function proceedOfflineMerge() {
  const pending = window._pendingOfflineMerge;
  if (!pending) return;
  if (pending._executing) return;
  pending._executing = true;

  if (pending.duplicates.length > 0) {
    pending.stage = 'conflicts';
    showDuplicateProfilesModal(pending.duplicates);
  } else {
    applyOfflineMerge(pending.newProfiles, []);
  }
}

function applyOfflineMerge(newProfiles, duplicateChoices) {
  closeModal(); // fecha o modal imediatamente para feedback visual
  
  // 1. Adiciona perfis novos (sem conflito)
  for (const p of newProfiles) {
    if (!state.profiles.find(ep => ep.id === p.id)) {
      state.profiles.push({
        ...p,
        cloudId: null,
        matches: (p.matches || []).map(m => ({
          ...m,
          id: "m" + Date.now() + Math.random().toString(36).substr(2, 5)
        }))
      });
    }
  }

  // 2. Aplica resoluções de duplicados
  const pending = window._pendingOfflineMerge;
  if (pending && pending.duplicates.length > 0) {
    for (let idx = 0; idx < pending.duplicates.length; idx++) {
      const choice = duplicateChoices[idx] || 'ignore';
      const dp = pending.duplicates[idx];

      if (choice === 'merge') {
        const accountProfile = state.profiles.find(p =>
          p.game === dp.game && p.mode === dp.mode && p.server === dp.server
        );
        if (accountProfile) {
          const incoming = (dp.matches || []).map(m => ({
            ...m,
            id: "m" + Date.now() + Math.random().toString(36).substr(2, 5)
          }));
          accountProfile.matches = accountProfile.matches.concat(incoming);
          (dp.maps || []).forEach(map => {
            if (!accountProfile.maps.includes(map)) accountProfile.maps.push(map);
          });
          normalizeProfileMatches(accountProfile);
        }
      } else if (choice === 'separate') {
        const newProfile = {
          ...dp,
          id: "p" + Date.now() + Math.random().toString(36).substr(2, 5),
          cloudId: null,
          matches: (dp.matches || []).map(m => ({
            ...m,
            id: "m" + Date.now() + Math.random().toString(36).substr(2, 5)
          }))
        };
        state.profiles.push(newProfile);
      }
      // choice === 'ignore': nao faz nada (gt_v1 mantem o perfil local)
    }
  }

  // 3. Ajusta perfil ativo se necessario
  if (!state.activeProfileId && state.profiles.length > 0) {
    state.activeProfileId = state.profiles[0].id;
    activeProfileId = state.activeProfileId;
  }
  saveState();

  // 4. Backup dos dados offline antes de remover (Regra 31)
  if (pending && pending.offlineData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const blob = new Blob([JSON.stringify(pending.offlineData, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `aimdata-offline-backup-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  // 5. Remove dados offline brutos
  localStorage.removeItem("gt_v1");
  delete window._pendingOfflineMerge;

  refreshAll();
  showToast("✓ Dados offline incorporados à conta");

  // 6. Continua para o fluxo de sync normal (mergeCloudData cuidará do sync completo)
  setTimeout(() => promptFirstSync(), 500);
}

function showDuplicateProfilesModal(duplicates) {
  closeModal();

  let body = `
    <p style="font-size:13px;color:var(--sub);line-height:1.7;margin-bottom:16px;">
      Detectamos ${duplicates.length} perfil(s) com o mesmo jogo, modo e servidor tanto no navegador quanto na conta:
    </p>
  `;

  duplicates.forEach((dp, idx) => {
    body += `
      <div style="background:var(--surface);border:1px solid var(--border);padding:14px 16px;margin-bottom:12px;">
        <div style="font-family:'Rajdhani',sans-serif;font-size:14px;font-weight:600;margin-bottom:8px;color:var(--text);">
          ${profileLabel(dp)}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;font-size:12px;color:var(--text);">
            <input type="radio" name="dup-${idx}" value="merge" checked>
            <span><strong style="color:var(--confirm);">Mesclar</strong> — unir partidas no perfil da conta</span>
          </label>
          <label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;font-size:12px;color:var(--text);">
            <input type="radio" name="dup-${idx}" value="separate">
            <span><strong style="color:var(--brand);">Manter separado</strong> — criar perfil novo na conta</span>
          </label>
          <label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;font-size:12px;color:var(--text);">
            <input type="radio" name="dup-${idx}" value="ignore">
            <span><strong style="color:var(--action);">Ignorar</strong> — manter perfil local no navegador apenas</span>
          </label>
        </div>
      </div>
    `;
  });

  document.getElementById("modal-title").textContent = "Conflito de importação";
  document.getElementById("modal-body").innerHTML = body;
  document.getElementById("modal-actions").innerHTML = `
    <button class="modal-cancel" onclick="closeModal(); finishOfflineResolution();">Cancelar</button>
    <button class="modal-save" id="btn-resolve-dup" onclick="this.disabled=true;this.textContent='Processando...';resolveDuplicateProfiles()">Confirmar</button>
  `;
  document.getElementById("modal-overlay").classList.add("open");

  window._pendingDuplicates = duplicates;
}

function resolveDuplicateProfiles() {
  const pending = window._pendingOfflineMerge;
  if (!pending || pending.stage !== 'conflicts') {
    closeModal();
    return;
  }

  const choices = [];
  for (let idx = 0; idx < pending.duplicates.length; idx++) {
    const choice = document.querySelector(`input[name="dup-${idx}"]:checked`)?.value || 'ignore';
    choices.push(choice);
  }
  closeModal();

  applyOfflineMerge(pending.newProfiles, choices);
}


function finishOfflineResolution() {
  delete window._pendingOffline;
  delete window._pendingDuplicates;
  setTimeout(() => promptFirstSync(), 500);
}


async function aceitarSync(hasCloud) {
  closeModal();
  localStorage.setItem("sync_consented", "true");
  clearSyncPending();
  if (hasCloud) {
    const merged = await mergeCloudData();
    if (!merged) showToast("⚠ Falha ao sincronizar. Tente o botão Sync.");
  } else {
    const uploaded = await uploadLocalData();
    if (!uploaded) showToast("⚠ Falha ao enviar dados. Tente o botão Sync.");
  }
}

function recusarSync() {
  closeModal();
  markSyncPending();
  showToast("✓ Tudo bem. Use o botão Sync quando quiser salvar na nuvem.");
}

function markSyncPending() {
  localStorage.setItem("sync_pending", "true");
  const btn = document.getElementById("syncBtn");
  if (btn) btn.classList.add("sync-pending");
}

function clearSyncPending() {
  localStorage.removeItem("sync_pending");
  const btn = document.getElementById("syncBtn");
  if (btn) btn.classList.remove("sync-pending");
}

let isSyncing = false;

async function handleManualSync() {
  if (!currentUser) { showToast("⚠ Faça login primeiro"); return; }
  if (isSyncing) { showToast("⏳ Sincronização já em andamento"); return; }
  
  isSyncing = true;
  const btn = document.getElementById("syncBtn");
  if (btn) {
    btn.textContent = "☁ ...";
    btn.classList.remove("sync-pending");
    btn.disabled = true;
  }
  localStorage.setItem("sync_consented", "true");
  clearSyncPending();
  
  try {
    await mergeCloudData();
  } catch (e) {
    console.error("Erro no sync manual:", e);
    showToast("⚠ Falha na sincronização. Verifique o console.");
  } finally {
    isSyncing = false;
    if (btn) {
      btn.textContent = "☁ Sync";
      btn.disabled = false;
    }
  }
}

