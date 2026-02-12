/* ==========================================
   UI COMPONENTS
   ========================================== */

const UI = {
  // Toast notifications
  toast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; setTimeout(() => toast.remove(), 300); }, 4000);
  },

  // Modal
  openModal(title, bodyHtml, footerHtml, options = {}) {
    let overlay = document.getElementById('modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.className = 'modal-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="modal" style="${options.maxWidth ? 'max-width:' + options.maxWidth : ''}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="btn btn-icon btn-ghost" onclick="UI.closeModal()">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    `;
    overlay.onclick = (e) => { if (e.target === overlay) UI.closeModal(); };
    requestAnimationFrame(() => overlay.classList.add('active'));
  },

  closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) { overlay.classList.remove('active'); setTimeout(() => overlay.remove(), 300); }
  },

  // Confirm dialog
  confirm(message) {
    return new Promise(resolve => {
      this.openModal('Confirmar', `<p style="font-size:14px;color:var(--text-secondary)">${message}</p>`,
        `<button class="btn btn-secondary" onclick="UI.closeModal(); UI._confirmResolve(false)">Cancelar</button>
         <button class="btn btn-danger" onclick="UI.closeModal(); UI._confirmResolve(true)">Confirmar</button>`
      );
      UI._confirmResolve = resolve;
      UI._confirmResolve = resolve;
    });
  },

  // Prompt dialog
  prompt(message, type = 'text') {
    return new Promise(resolve => {
      this.openModal(type === 'password' ? 'Segurança' : 'Entrada',
        `<p style="font-size:14px;color:var(--text-secondary);margin-bottom:12px">${message}</p>
         <input type="${type}" id="prompt-input" class="form-input" style="width:100%" placeholder="${type === 'password' ? '••••••' : ''}">`,
        `<button class="btn btn-secondary" onclick="UI.closeModal(); UI._promptResolve(null)">Cancelar</button>
         <button class="btn btn-primary" onclick="UI.closeModal(); UI._promptResolve(document.getElementById('prompt-input').value)">Confirmar</button>`
      );
      // Auto-focus
      setTimeout(() => document.getElementById('prompt-input')?.focus(), 100);
      UI._promptResolve = resolve;
    });
  },

  // Sidebar
  renderSidebar(currentRoute, alertCount, settings, logs = [], projects = []) {
    const s = settings || SystemStore.get();
    const collapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    const logoHtml = s.logoType === 'url' && s.logoUrl
      ? `<img src="${s.logoUrl}" style="width:32px;height:32px;border-radius:8px;object-fit:cover">`
      : `<div class="logo-icon">${s.logoIcon || 'G'}</div>`;

    let activityHtml = `
      <div class="nav-section" style="margin-top:auto;padding-top:12px;border-top:1px solid var(--sidebar-border)">
        <div class="nav-section-title">ATIVIDADES RECENTES</div>
        <div class="sidebar-activity-list">`;

    if (logs && logs.length > 0) {
      activityHtml += logs.slice(0, 8).map(l => {
        const proj = projects.find(p => p.id === l.projectId);
        const projName = proj ? proj.name : (l.projectId ? 'Desconhecido' : 'Sistema');
        // Prevent clicking 'System' logs if no project ID
        const onClickAttr = l.projectId ? `onclick="App.openProjectActivity('${l.projectId}')"` : '';
        const styleAttr = l.projectId ? '' : 'style="cursor:default"';

        return `
          <div class="act-item-side" ${onClickAttr} ${styleAttr} title="Ver histórico do projeto">
            <div class="act-proj-side">${projName}</div>
            <div class="act-desc-side">${l.details}</div>
            <div class="act-time-side">${new Date(l.date).toLocaleString()}</div>
          </div>`;
      }).join('');
    } else {
      activityHtml += `<div class="act-time-side" style="text-align:center;padding:8px">Nenhuma atividade registrada</div>`;
    }

    activityHtml += `</div></div>`;

    return `
    <div class="sidebar ${collapsed ? 'collapsed' : ''}" id="sidebar">
      <div class="sidebar-logo">
        ${logoHtml}
        <div class="logo-text">
          <h1>${s.name}</h1>
          <div class="logo-sub">${s.subtitle}</div>
        </div>
      </div>
      <button class="sidebar-toggle" onclick="UI.toggleSidebar()" title="${collapsed ? 'Expandir menu' : 'Recolher menu'}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <nav class="sidebar-nav">
        <div class="nav-section">
          <div class="nav-section-title">Menu</div>
          <button class="nav-item ${currentRoute === '/' ? 'active' : ''}" onclick="App.navigate('/')" data-tooltip="Dashboard">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            <span class="nav-label">Dashboard</span>
          </button>
          <button class="nav-item ${currentRoute.startsWith('/projects') ? 'active' : ''}" onclick="App.navigate('/projects')" data-tooltip="Projetos">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            <span class="nav-label">Projetos</span>
          </button>
          <button class="nav-item ${currentRoute === '/personas' ? 'active' : ''}" onclick="App.navigate('/personas')" data-tooltip="Equipe">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            <span class="nav-label">Equipe</span>
          </button>
          <button class="nav-item ${currentRoute === '/analytics' ? 'active' : ''}" onclick="App.navigate('/analytics')" data-tooltip="Análises">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            <span class="nav-label">Análises</span>
          </button>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Sistema</div>
          <button class="nav-item ${currentRoute === '/templates' ? 'active' : ''}" onclick="App.navigate('/templates')" data-tooltip="Templates PDF">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <span class="nav-label">Templates PDF</span>
          </button>
          <button class="nav-item ${currentRoute === '/settings' ? 'active' : ''}" onclick="App.navigate('/settings')" data-tooltip="Configurações">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            <span class="nav-label">Configurações</span>
          </button>
        </div>
        ${activityHtml}
      </nav>
      <div class="sidebar-footer">
        <div style="font-size:11px;color:var(--text-muted)">📅 ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
    </div>`;
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    const isCollapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebar-collapsed', isCollapsed);
    this.initSidebarTooltips();
  },

  // JS-based tooltips for collapsed sidebar
  _tooltipEl: null,
  initSidebarTooltips() {
    // Remove existing tooltip
    if (this._tooltipEl) { this._tooltipEl.remove(); this._tooltipEl = null; }
    // Create tooltip element on body
    const tip = document.createElement('div');
    tip.className = 'sidebar-tooltip';
    document.body.appendChild(tip);
    this._tooltipEl = tip;

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const items = sidebar.querySelectorAll('.nav-item[data-tooltip]');
    items.forEach(item => {
      item.addEventListener('mouseenter', () => {
        if (!sidebar.classList.contains('collapsed')) return;
        const rect = item.getBoundingClientRect();
        tip.textContent = item.getAttribute('data-tooltip');
        tip.style.left = (rect.right + 10) + 'px';
        tip.style.top = (rect.top + rect.height / 2) + 'px';
        tip.style.transform = 'translateY(-50%)';
        tip.classList.add('visible');
      });
      item.addEventListener('mouseleave', () => {
        tip.classList.remove('visible');
      });
    });
  },

  // Project card for list view
  renderProjectCard(project) {
    const progress = getProjectProgress(project.stages);
    const current = getCurrentStage(project.stages);
    const currentDef = current ? getStageDefinition(current.stage_key) : null;
    const deadlineDays = current ? daysUntilDeadline(current.deadline) : null;
    let deadlineClass = '';
    if (deadlineDays !== null) {
      if (deadlineDays < 0) deadlineClass = 'overdue';
      else if (deadlineDays <= 3) deadlineClass = 'soon';
    }

    return `
    <div class="card clickable" onclick="App.navigate('/projects/${project.id}')" style="cursor:pointer">
      <div class="flex items-center justify-between mb-16">
        <div>
          <div style="font-size:15px;font-weight:700">${project.name}</div>
          <div style="font-size:12px;color:var(--text-muted)">${project.client}</div>
        </div>
        <div class="flex gap-8">
          <span class="badge badge-${project.priority}">${PRIORITY_LABELS[project.priority] || project.priority}</span>
          <span class="badge badge-${project.status}">${STATUS_LABELS[project.status] || project.status}</span>
        </div>
      </div>
      ${currentDef ? `
      <div class="flex items-center gap-8 mb-16" style="font-size:12px">
        <span class="stage-dot" style="background:${currentDef.color}"></span>
        <span style="color:var(--text-secondary)">Etapa atual: <strong style="color:var(--text-primary)">${currentDef.name}</strong></span>
        ${deadlineDays !== null ? `
        <span class="ml-auto kc-deadline ${deadlineClass}" style="font-size:11px">
          ${deadlineDays < 0 ? `⚠ ${Math.abs(deadlineDays)}d atrasado` : deadlineDays === 0 ? '⚠ Vence hoje' : `📅 ${deadlineDays}d restantes`}
        </span>` : ''}
      </div>` : ''}
      <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:6px">${progress}% concluído</div>
    </div>`;
  },

  // Kanban card
  renderKanbanCard(project, stage) {
    const deadlineDays = daysUntilDeadline(stage.deadline);
    let deadlineClass = '';
    if (deadlineDays !== null) {
      if (deadlineDays < 0) deadlineClass = 'overdue';
      else if (deadlineDays <= 3) deadlineClass = 'soon';
    }

    return `
    <div class="kanban-card" draggable="true" data-project-id="${project.id}" data-stage-id="${stage.id}" onclick="App.navigate('/projects/${project.id}')">
      <div class="kc-title">${project.name}</div>
      <div class="kc-client">${project.client}</div>
      <div class="kc-footer">
        ${stage.persona ? `<div class="kc-avatar" style="background:${stage.persona.color || '#8b5cf6'}">${getInitials(stage.persona.name)}</div>` : '<div></div>'}
        ${stage.deadline ? `<div class="kc-deadline ${deadlineClass}">📅 ${formatDate(stage.deadline)}</div>` : ''}
      </div>
    </div>`;
  },

  // Stage timeline for project detail
  renderTimeline(stages) {
    let html = '<div class="timeline-track">';
    stages.forEach((stage, i) => {
      const def = getStageDefinition(stage.stage_key);
      if (!def) return;
      html += `
        <div class="timeline-step ${stage.status}" data-stage-id="${stage.id}">
          <div class="step-dot" style="${stage.status === 'completed' ? '' : stage.status === 'in_progress' ? `border-color:${def.color};color:${def.color}` : ''}">${stage.status === 'completed' ? '✓' : def.icon}</div>
          <div class="step-label">${def.name}</div>
          <div class="step-date">${stage.status === 'completed' ? formatDate(stage.completed_date) : stage.deadline ? formatDate(stage.deadline) : '—'}</div>
        </div>`;
      if (i < stages.length - 1) {
        const nextCompleted = stages[i + 1]?.status === 'completed';
        html += `<div class="timeline-connector ${stage.status === 'completed' && nextCompleted ? 'completed' : ''}"></div>`;
      }
    });
    html += '</div>';
    return html;
  },

  // Stage detail card
  renderStageCard(stage, personas) {
    const def = getStageDefinition(stage.stage_key);
    if (!def) return '';
    const deadlineDays = daysUntilDeadline(stage.deadline);
    let deadlineInfo = '';
    if (stage.status !== 'completed' && stage.status !== 'skipped' && deadlineDays !== null) {
      if (deadlineDays < 0) deadlineInfo = `<span class="badge badge-overdue">⚠ ${Math.abs(deadlineDays)}d atrasado</span>`;
      else if (deadlineDays <= 3) deadlineInfo = `<span class="badge badge-high">📅 ${deadlineDays}d restantes</span>`;
    }

    // Client review days calculation
    let clientReviewBadge = '';
    if (stage.client_review_start && stage.client_review_end) {
      const d = Math.ceil((new Date(stage.client_review_end) - new Date(stage.client_review_start)) / 86400000);
      clientReviewBadge = `<span class="badge badge-paused" style="font-size:10px">${d} dia(s) com cliente</span>`;
    } else if (stage.client_review_start && !stage.client_review_end) {
      const d = Math.ceil((new Date() - new Date(stage.client_review_start)) / 86400000);
      clientReviewBadge = `<span class="badge badge-overdue" style="font-size:10px">${d} dia(s) aguardando</span>`;
    }

    return `
    <div class="stage-card" style="border-left-color:${def.color}" id="stage-${stage.id}">

      <!-- Header: Title + Status -->
      <div class="sc-header">
        <div class="sc-title"><span class="stage-dot" style="background:${def.color}"></span>${def.icon} ${def.name}</div>
        <div class="flex gap-8 items-center">
          ${deadlineInfo}
          <select class="form-select" style="padding:5px 10px;font-size:11px;min-width:120px" onchange="App.updateStageStatus('${stage.id}', this.value)">
            <option value="pending" ${stage.status === 'pending' ? 'selected' : ''}>Pendente</option>
            <option value="in_progress" ${stage.status === 'in_progress' ? 'selected' : ''}>Em Andamento</option>
            <option value="completed" ${stage.status === 'completed' ? 'selected' : ''}>Concluído</option>
            ${def.optional ? `<option value="skipped" ${stage.status === 'skipped' ? 'selected' : ''}>Pulado</option>` : ''}
          </select>
        </div>
      </div>

      <!-- Dates row -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px">
        <div style="text-align:center;padding:8px 10px;background:var(--bg-base);border-radius:var(--radius-sm);border:1px solid var(--border)">
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Início</div>
          <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${formatDate(stage.start_date)}</div>
        </div>
        <div style="text-align:center;padding:8px 10px;background:var(--bg-base);border-radius:var(--radius-sm);border:1px solid var(--border)">
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Prazo</div>
          <div style="font-size:12px;font-weight:600;color:${deadlineDays !== null && deadlineDays < 0 ? 'var(--danger)' : 'var(--text-primary)'}">${formatDate(stage.deadline)}</div>
        </div>
        <div style="text-align:center;padding:8px 10px;background:var(--bg-base);border-radius:var(--radius-sm);border:1px solid var(--border)">
          <div style="font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Conclusão</div>
          <div style="font-size:12px;font-weight:600;color:${stage.completed_date ? 'var(--success)' : 'var(--text-muted)'}">${formatDate(stage.completed_date)}</div>
        </div>
      </div>

      <!-- Responsável -->
      <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
        <span style="font-size:12px;color:var(--text-muted);font-weight:500">Responsável:</span>
        <select class="form-select" style="flex:1;padding:6px 10px;font-size:11px;max-width:220px" onchange="App.updateStagePersona('${stage.id}', this.value)">
          <option value="">Ninguém</option>
          ${(personas || []).map(p => `<option value="${p.id}" ${stage.assigned_persona_id === p.id ? 'selected' : ''}>${p.name} (${p.role})</option>`).join('')}
        </select>
      </div>

      <!-- Client Review -->
      <div style="margin-top:14px;padding:10px 14px;background:var(--bg-base);border-radius:var(--radius-sm);border:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">⏳ Aprovação do Cliente</span>
          ${clientReviewBadge}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="font-size:12px;color:var(--text-secondary)">
            <span style="color:var(--text-muted)">Enviado:</span> ${stage.client_review_start ? `<strong style="color:var(--text-primary)">${formatDate(stage.client_review_start)}</strong>` : '<span style="color:var(--text-muted)">—</span>'}
          </div>
          <div style="font-size:12px;color:var(--text-secondary)">
            <span style="color:var(--text-muted)">Aprovado:</span> ${stage.client_review_end ? `<strong style="color:var(--success)">${formatDate(stage.client_review_end)}</strong>` : (stage.client_review_start ? '<span style="color:var(--warning)">Aguardando...</span>' : '<span style="color:var(--text-muted)">—</span>')}
          </div>
        </div>
      </div>

      <!-- Notes -->
      ${stage.notes ? `<div style="margin-top:12px;padding:8px 12px;font-size:12px;color:var(--text-muted);font-style:italic;background:var(--bg-base);border-radius:var(--radius-sm);border-left:3px solid ${def.color}">"${stage.notes}"</div>` : ''}

      <!-- Subtasks -->
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted)">TASKS (${stage.subtasks ? stage.subtasks.filter(t => t.done).length : 0}/${stage.subtasks ? stage.subtasks.length : 0})</div>
        </div>
        <div class="checklist">
          ${(stage.subtasks || []).map((t, i) => `
            <div class="checklist-item">
              <input type="checkbox" ${t.done ? 'checked' : ''} onchange="App.toggleSubtask('${stage.id}', ${i})">
              <span class="${t.done ? 'checked' : ''}" style="flex:1;font-size:12px">${t.text}</span>
              <button class="btn-icon btn-ghost" style="width:20px;height:20px;font-size:10px" onclick="App.deleteSubtask('${stage.id}', ${i})">✕</button>
            </div>
          `).join('')}
        </div>
        <div class="flex gap-4 mt-8">
          <input type="text" class="form-input" style="padding:4px 8px;font-size:12px;height:28px" placeholder="Nova tarefa..." id="new-task-${stage.id}" onkeypress="if(event.key==='Enter')App.addSubtask('${stage.id}')">
          <button class="btn btn-secondary" style="padding:0 8px;height:28px" onclick="App.addSubtask('${stage.id}')">+</button>
        </div>
      </div>

      <!-- Attachments -->
      <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:8px">ANEXOS</div>
        <div class="checklist">
          ${(stage.attachments || []).map((f, i) => `
            <div class="checklist-item">
              <a href="${f.url}" target="_blank" style="flex:1;font-size:12px;color:var(--accent-violet);text-decoration:none;display:flex;align-items:center;gap:6px">
                <span>📄</span> ${f.name}
              </a>
              <button class="btn-icon btn-ghost" style="width:20px;height:20px;font-size:10px" onclick="App.deleteAttachment('${stage.id}', ${i})">✕</button>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-secondary btn-sm mt-8" onclick="document.getElementById('file-${stage.id}').click()" style="font-size:11px;width:100%">📎 Anexar Arquivo</button>
        <input type="file" id="file-${stage.id}" style="display:none" onchange="App.uploadAttachment('${stage.id}', this.files[0])">
      </div>

      <!-- Actions -->
      <div style="display:flex;gap:6px;margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        <button class="btn btn-ghost btn-sm" onclick="App.editStageDates('${stage.id}')">📅 Datas</button>
        <button class="btn btn-ghost btn-sm" onclick="App.editClientReview('${stage.id}')">⏳ Aprovação</button>
        <button class="btn btn-ghost btn-sm" onclick="App.editStageNotes('${stage.id}')">📝 Notas</button>
      </div>
    </div>`;
  },

  // Persona card
  renderPersonaCard(persona, projectCount) {
    return `
    <div class="persona-card">
      <div class="persona-avatar" style="background:${persona.color || '#8b5cf6'}">${getInitials(persona.name)}</div>
      <div class="pc-name">${persona.name}</div>
      <div class="pc-role">${persona.role}</div>
      ${persona.email ? `<div class="pc-email">${persona.email}</div>` : ''}
      <div class="pc-stats">${projectCount} etapa(s) atribuída(s)</div>
      <div class="flex gap-8 justify-between mt-16" style="justify-content:center">
        <button class="btn btn-ghost btn-sm" onclick="App.editPersona('${persona.id}')">✏️ Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="App.deletePersona('${persona.id}')">🗑️ Excluir</button>
      </div>
    </div>`;
  },

  // Alert item
  renderAlertItem(alert) {
    return `
    <div class="alert-item animate-slide-up">
      <div class="alert-dot ${alert.type}"></div>
      <div class="alert-text">${alert.message}</div>
      <div class="alert-date">${formatDate(alert.alert_date)}</div>
      <button class="alert-dismiss btn btn-icon btn-ghost btn-sm" onclick="App.dismissAlert('${alert.id}')">✕</button>
    </div>`;
  },

  // Insight card
  renderInsightCard(insight) {
    return `
    <div class="insight-card insight-${insight.type}">
      <div class="insight-icon">${insight.icon}</div>
      <div class="insight-content">
        <h4>${insight.title}</h4>
        <p>${insight.text}</p>
      </div>
    </div>`;
  },

  // Loading spinner
  loading() { return '<div class="loading-spinner"></div>'; },

  // Empty state
  emptyState(icon, title, message, actionHtml) {
    return `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h3>${title}</h3>
      <p>${message}</p>
      ${actionHtml || ''}
    </div>`;
  }
};
