/* Nome e Local do Ficheiro: js/profiles.js */

/* ============================================================
   RENDERIZAÇÃO — PERFIS
   Monta a lista de perfis e o modal de criar/editar perfil,
   incluindo seleção de métricas e gerenciamento de mapas.
   ============================================================ */
function openProfilesManager() {
  document.getElementById("modal-title").textContent = "Gerenciar Perfis";
  
  let bodyHtml = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <div style="font-family:'Rajdhani',sans-serif;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:var(--sub);">Seus Perfis</div>
    <button class="hbtn confirm" onclick="openModal('new')">＋ Criar</button>
  </div>`;
  
  const realProfiles = state.profiles.filter(p => !p.isDemo);
  if (!realProfiles.length) {
    bodyHtml += `<div class="empty-state"><div class="e-icon">🎮</div><div class="e-title">Nenhum perfil criado</div><div class="e-sub">Crie um perfil para visualizar a lista de perfis.</div></div>`;
  } else {
    bodyHtml += realProfiles.map(p => `<div class="profile-item${p.id===activeProfileId?" active-profile":""}" style="cursor:pointer;flex-wrap:nowrap;" onclick="switchProfile('${p.id}');openProfilesManager();"><div style="flex:1;min-width:0;pointer-events:none;text-align:left;"><div style="margin-bottom:4px;"><span class="profile-name" style="flex:0 auto;">${profileLabel(p)}</span></div><div class="profile-sub">${p.matches.length} partidas · ${p.metrics.length} métricas · ${p.maps.length} mapas</div></div><div class="profile-actions" style="pointer-events:auto;flex-shrink:0;"><button class="hbtn action" style="font-size:9px;padding:5px 10px;letter-spacing:1px;" onclick="event.stopPropagation();openModal('edit','${p.id}')" title="Editar perfil">✎ Editar</button>${realProfiles.length>1?`<button class="hbtn danger" style="font-size:9px;padding:5px 10px;letter-spacing:1px;" onclick="event.stopPropagation();deleteProfile('${p.id}')" title="Excluir perfil">🗑 Excluir</button>`:""}</div></div>`).join("");
  }
  
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-actions").innerHTML = `<button class="modal-cancel" onclick="closeModal()">Fechar</button>`;
  document.getElementById("modal-overlay").classList.add("open");
}

let modalMode="new", modalProfileId=null, modalMaps=[];
function openModal(mode, profileId) {
  modalMode=mode; modalProfileId=profileId||activeProfileId;
  const isNew=mode==="new"; const p=isNew?null:getProfile(modalProfileId);
  document.getElementById("modal-title").textContent=isNew?"Criar Perfil":"Editar Perfil";
  modalMaps=isNew?[]:[...p.maps];
  const selectedMetrics=isNew?ALL_METRICS.map(m=>m.id):p.metrics;
  document.getElementById("modal-body").innerHTML=`<div class="field"><label>Jogo</label><input type="text" id="m-game" placeholder="ex: Delta Force, Call of Duty, Battlefield, Apex Legends, etc " value="${p?.game||""}"></div><div class="form-row" style="margin-bottom:12px;"><div class="field" style="margin-bottom:0"><label>Modo</label><input type="text" id="m-mode" placeholder="ex: Guerra, Mata Mata, Extração, Battle Royale, Tático e etc" value="${p?.mode||""}"></div><div class="field" style="margin-bottom:0"><label>Servidor (opcional)</label><input type="text" id="m-server" placeholder="ex: BR, NA, EU, etc" value="${p?.server||""}"></div></div><hr class="divider"><span class="section-label">Métricas</span><div class="metric-grid" id="metricGrid">${ALL_METRICS.map(m=>`<label class="metric-item"><input type="checkbox" value="${m.id}" ${selectedMetrics.includes(m.id)?"checked":""}><div><span>${m.label}</span>${m.type==="calc"?`<br><small>requer: ${m.needs.join(", ")}</small>`:""}</div></label>`).join("")}</div><hr class="divider"><span class="section-label">Mapas</span><div class="tag-list" id="modalTagList"></div><div class="add-tag-row"><input type="text" id="m-map-input" placeholder="Nome do mapa" onkeydown="if(event.key==='Enter')addModalMap()"><button class="add-tag-btn" onclick="addModalMap()">＋ Criar</button></div>`;
  renderModalTags();
  document.getElementById("modal-actions").innerHTML=`<button class="modal-cancel" onclick="closeModal()">Cancelar</button><button class="modal-save" onclick="saveModal()">Salvar</button>`;
  document.getElementById("modal-overlay").classList.add("open");
}
function renderModalTags() { document.getElementById("modalTagList").innerHTML=modalMaps.map((m,i)=>`<div class="tag"><span class="tag-name" onclick="renameModalMap(${i})" title="Clique para renomear" style="cursor:pointer;">${m}</span><button class="tag-remove" onclick="removeModalMap(${i})">×</button></div>`).join(""); }
let renameModalState = null;
function renameModalMap(i) {
  const oldName = modalMaps[i];
  if (typeof oldName !== 'string') return;
  const p = (modalMode === "edit" && modalProfileId) ? getProfile(modalProfileId) : null;
  const affected = (p && Array.isArray(p.matches)) ? p.matches.filter(m => mapEquals(m.map, oldName)).length : 0;
  renameModalState = { index: i, oldName, affected };
  document.getElementById("modal-title").textContent = "Renomear mapa";
  document.getElementById("modal-body").innerHTML = `<div class="field"><label>Novo nome do mapa</label><input type="text" id="rename-map-input" value="${oldName.replace(/"/g, '&quot;')}" autocomplete="off" style="width:100%;">${affected > 0 ? `<div style="margin-top:8px;font-size:12px;color:var(--sub);line-height:1.6;">Este mapa tem <strong style="color:var(--text);">${affected} partida(s)</strong>. Todas serão atualizadas para o novo nome.</div>` : ""}</div>`;
  document.getElementById("modal-actions").innerHTML = `<button class="modal-cancel" onclick="cancelRenameMap()">Cancelar</button><button class="modal-save" onclick="confirmRenameMap()">Renomear</button>`;
  document.getElementById("modal-overlay").classList.add("open");
  setTimeout(() => { const inp = document.getElementById("rename-map-input"); if (inp) { inp.focus(); inp.select(); } }, 0);
}
function cancelRenameMap() { renameModalState = null; closeModal(); openModal(modalMode, modalProfileId); }
function confirmRenameMap() {
  if (!renameModalState) return;
  const { index, oldName, affected } = renameModalState;
  const newName = (document.getElementById("rename-map-input")?.value || "").trim();
  if (!newName) { showToast("⚠ Informe o novo nome"); return; }
  if (mapEquals(newName, oldName)) { renameModalState = null; closeModal(); openModal(modalMode, modalProfileId); return; }
  const dupIndex = modalMaps.findIndex((m, idx) => idx !== index && mapEquals(newName, m));
  if (dupIndex !== -1) { showToast(`⚠ Já existe um mapa "${modalMaps[dupIndex]}" (ignorando maiúsculas/acentos)`); return; }
  const p = (modalMode === "edit" && modalProfileId) ? getProfile(modalProfileId) : null;
  if (p && Array.isArray(p.maps)) {
    const mapIdx = p.maps.findIndex(m => mapEquals(m, oldName));
    if (mapIdx !== -1) p.maps[mapIdx] = newName;
  }
  if (affected > 0 && p && Array.isArray(p.matches)) {
    p.matches.forEach(m => { if (mapEquals(m.map, oldName)) m.map = newName; });
  }
  if (p) {
    saveState();
    if (currentUser && supabaseClient) {
      syncProfileToCloud(p);
      if (affected > 0) syncToCloud("upsert_matches", { profileId: p.id, matches: p.matches });
    }
  }
  modalMaps[index] = newName;
  const idx = index;
  renameModalState = null;
  closeModal();
  openModal(modalMode, modalProfileId);
  showToast("✓ Mapa renomeado");
}function addModalMap() { const inp=document.getElementById("m-map-input"); const val=inp.value.trim(); if(!val)return; if(modalMaps.includes(val)){showToast("Mapa já existe");return;} modalMaps.push(val); renderModalTags(); inp.value=""; }

function removeModalMap(i) {
  const mapName = modalMaps[i];
  if (typeof mapName !== 'string') { modalMaps.splice(i,1); renderModalTags(); return; }
  const p = (modalMode === "edit" && modalProfileId) ? getProfile(modalProfileId) : null;
  if (p && Array.isArray(p.matches)) {
    const orphans = p.matches.filter(m => mapInList(m.map, [mapName])).length;
    if (orphans > 0) {
      const ok = confirm(
        `O mapa "${mapName}" tem ${orphans} partida(s) registrada(s).\n\n` +
        `Se você remover este mapa do perfil, as partidas NÃO serão apagadas, mas:\n` +
        `• o mapa deixa de aparecer no filtro do Histórico;\n` +
        `• deixa de sair no agrupamento por mapa (gráfico e tabela);\n` +
        `• a partida continua visível na lista normalmente.\n\n` +
        `Remover o mapa mesmo assim?`
      );
      if (!ok) return;
    }
  }
  modalMaps.splice(i,1);
  renderModalTags();
}
function saveModal() {
  const game=document.getElementById("m-game").value.trim();
  const mode=document.getElementById("m-mode").value.trim();
  const server=document.getElementById("m-server").value.trim();
  const metrics=[...document.querySelectorAll("#metricGrid input:checked")].map(c=>c.value);
  
  // Ordena mapas alfabeticamente antes de salvar
  modalMaps.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  
  if(!game){showToast("⚠ Informe o nome do jogo");return;}
  if(!metrics.length){showToast("⚠ Selecione pelo menos uma métrica");return;}
  if(!metrics.length){showToast("⚠ Selecione pelo menos uma métrica");return;}
  if(modalMode==="new"){
    removeDemoProfile();
    const id = "p" + Date.now();
    state.profiles.push({ id, game, mode, server, maps: modalMaps, metrics, matches: [] });
    activeProfileId=id; state.activeProfileId=id; showToast(`✓ Perfil "${game}" criado`);
  } else {
    const p=getProfile(modalProfileId); p.game=game; p.mode=mode; p.server=server; p.maps=modalMaps; p.metrics=metrics; showToast("✓ Perfil atualizado");
  }
  saveState(); closeModal(); refreshAll();
  if (currentUser && supabaseClient) {
    const savedProfile = modalMode === "new"
      ? state.profiles[state.profiles.length - 1]
      : getProfile(modalProfileId);
    if (savedProfile) syncProfileToCloud(savedProfile);
  }
}
async function deleteProfile(id) {
  if (id === '__demo__') {
    showToast("⚠ O perfil de demonstração não pode ser excluído manualmente. Crie seu próprio perfil para substituí-lo.");
    return;
  }
  if (!confirm("Excluir este perfil e todos os dados?")) return;
  
  const profile = getProfile(id);
  let cloudId = profile?.cloudId || null;
  
  // ─── PASSO 1: Deletar na nuvem PRIMEIRO ───
  if (supabaseClient && currentUser && cloudId) {
    showToast("⏳ Excluindo na nuvem...");
    
    // ─── SOFT DELETE: marca como deletado em vez de apagar ───
    let { data: updatedRows, error } = await supabaseClient
      .from("game_profiles")
      .update({ deleted: true, deleted_at: new Date().toISOString() })
      .eq("id", cloudId)
      .eq("user_id", currentUser.id)
      .eq("deleted", false)
      .select("id");
    
    // Se 0 linhas afetadas, o cloudId pode estar stale ou já deletado. Busca pelo local_id.
    if (!error && (!updatedRows || updatedRows.length === 0)) {
      console.warn(`[DELETE] cloudId ${cloudId} não encontrado na nuvem. Buscando por local_id...`);
      const { data: found, error: findErr } = await supabaseClient
        .from("game_profiles")
        .select("id, deleted")
        .eq("user_id", currentUser.id)
        .eq("local_id", profile.id)
        .single();
      
      if (!findErr && found) {
        if (found.deleted) {
          // Já está deletado na nuvem — considera sucesso
          updatedRows = [{ id: found.id }];
        } else {
          cloudId = found.id;
          const { data: updatedRows2, error: error2 } = await supabaseClient
            .from("game_profiles")
            .update({ deleted: true, deleted_at: new Date().toISOString() })
            .eq("id", cloudId)
            .eq("user_id", currentUser.id)
            .select("id");
            
          if (!error2 && updatedRows2 && updatedRows2.length > 0) {
            updatedRows = updatedRows2;
          } else {
            error = error2 || new Error("Não foi possível deletar na nuvem após corrigir cloudId");
          }
        }
      } else {
        error = findErr || new Error("Perfil não encontrado na nuvem pelo local_id");
      }
    }
    
    if (error) {
      logStructuredError({ level: 'ERROR', operation: 'deleteProfile', message: 'Erro ao excluir perfil da nuvem', context: { error: error.message } });
      showToast("⚠ Perfil excluído localmente. Falha ao remover da nuvem — tente o botão Sync.");
      return;
    }
    
    if (!updatedRows || updatedRows.length === 0) {
      showToast("⚠ Perfil não encontrado na nuvem. Pode já ter sido excluído.");
    } else {
      showToast("☁ Perfil excluído da nuvem");
    }
  }
  
  // ─── PASSO 2: Só remove localmente se a nuvem confirmou (ou se nunca houve cloudId) ───
  generateEmergencyBackup();
  showToast("💾 Backup de segurança baixado");
  
  // Limpa metas do perfil do localStorage
  if (profile) {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith("goal_") && key.endsWith(`_${profile.id}`)) {
        localStorage.removeItem(key);
      }
    }
  }
  
  state.profiles = state.profiles.filter(p => p.id !== id);
  if (activeProfileId === id) {
    activeProfileId = state.profiles[0]?.id || null;
    state.activeProfileId = activeProfileId;
  }
  saveState(); closeModal(); refreshAll(); showToast("Perfil excluído");
}
function closeModal() { document.getElementById("modal-overlay").classList.remove("open"); }
function closeModalOutside(e) { if(e.target===document.getElementById("modal-overlay"))closeModal(); }

