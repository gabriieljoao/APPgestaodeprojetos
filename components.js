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
    });
  },

  // Sidebar
  renderSidebar(currentRoute, alertCount) {
    return `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <div class="logo-icon">G</div>
        <div>
          <h1>Gestão de Projetos</h1>
          <div class="logo-sub">Gerenciador de Sites</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">
          <div class="nav-section-title">Menu</div>
          <button class="nav-item ${currentRoute === '/' ? 'active' : ''}" onclick="App.navigate('/')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Dashboard
            ${alertCount > 0 ? `<span class="nav-badge">${alertCount}</span>` : ''}
          </button>
          <button class="nav-item ${currentRoute.startsWith('/projects') ? 'active' : ''}" onclick="App.navigate('/projects')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
            Projetos
          </button>
          <button class="nav-item ${currentRoute === '/personas' ? 'active' : ''}" onclick="App.navigate('/personas')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
            Equipe
          </button>
          <button class="nav-item ${currentRoute === '/analytics' ? 'active' : ''}" onclick="App.navigate('/analytics')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            Análises
          </button>
        </div>
        <div class="nav-section">
          <div class="nav-section-title">Sistema</div>
          <button class="nav-item ${currentRoute === '/settings' ? 'active' : ''}" onclick="App.navigate('/settings')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            Configurações
          </button>
        </div>
      </nav>
      <div class="sidebar-footer">
        <div style="font-size:11px;color:var(--text-muted)">📅 ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
    </div>`;
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

    return `
    <div class="stage-card" style="border-left-color:${def.color}" id="stage-${stage.id}">
      <div class="sc-header">
        <div class="sc-title"><span class="stage-dot" style="background:${def.color}"></span>${def.icon} ${def.name}</div>
        <div class="flex gap-8 items-center">
          ${deadlineInfo}
          <span class="badge badge-${stage.status}">${STATUS_LABELS[stage.status]}</span>
        </div>
      </div>
      <div class="sc-dates">
        <div class="sc-date-item"><strong>Início</strong>${formatDate(stage.start_date)}</div>
        <div class="sc-date-item"><strong>Prazo</strong>${formatDate(stage.deadline)}</div>
        <div class="sc-date-item"><strong>Conclusão</strong>${formatDate(stage.completed_date)}</div>
        <div class="sc-date-item"><strong>Status</strong>
          <select class="form-select" style="margin-top:4px;padding:6px 10px;font-size:11px" onchange="App.updateStageStatus('${stage.id}', this.value)">
            <option value="pending" ${stage.status === 'pending' ? 'selected' : ''}>Pendente</option>
            <option value="in_progress" ${stage.status === 'in_progress' ? 'selected' : ''}>Em Andamento</option>
            <option value="completed" ${stage.status === 'completed' ? 'selected' : ''}>Concluído</option>
            ${def.optional ? `<option value="skipped" ${stage.status === 'skipped' ? 'selected' : ''}>Pulado</option>` : ''}
          </select>
        </div>
      </div>
      <div class="sc-persona">
        <span style="color:var(--text-muted)">Responsável:</span>
        <select class="form-select" style="width:auto;padding:6px 10px;font-size:11px;min-width:150px" onchange="App.updateStagePersona('${stage.id}', this.value)">
          <option value="">Ninguém</option>
          ${(personas || []).map(p => `<option value="${p.id}" ${stage.assigned_persona_id === p.id ? 'selected' : ''}>${p.name} (${p.role})</option>`).join('')}
        </select>
      </div>
      <div class="sc-client-review" style="margin-top:10px;padding:10px 14px;background:var(--bg-base);border-radius:var(--radius-sm);border:1px solid var(--border)">
        <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">⏳ Aprovação do Cliente</div>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="font-size:12px;color:var(--text-secondary)">
            ${stage.client_review_start ? `Enviado: <strong style="color:var(--text-primary)">${formatDate(stage.client_review_start)}</strong>` : '<span style="color:var(--text-muted)">Não enviado</span>'}
          </div>
          <div style="font-size:12px;color:var(--text-secondary)">
            ${stage.client_review_end ? `Aprovado: <strong style="color:var(--success)">${formatDate(stage.client_review_end)}</strong>` : (stage.client_review_start ? '<span style="color:var(--warning)">Aguardando...</span>' : '')}
          </div>
          ${(() => {
        if (stage.client_review_start && stage.client_review_end) {
          const d = Math.ceil((new Date(stage.client_review_end) - new Date(stage.client_review_start)) / 86400000);
          return '<span class="badge badge-paused" style="font-size:10px">' + d + ' dia(s) com cliente</span>';
        } else if (stage.client_review_start && !stage.client_review_end) {
          const d = Math.ceil((new Date() - new Date(stage.client_review_start)) / 86400000);
          return '<span class="badge badge-overdue" style="font-size:10px">' + d + ' dia(s) aguardando</span>';
        }
        return '';
      })()}
        </div>
      </div>
      ${stage.notes ? `<div style="margin-top:10px;font-size:12px;color:var(--text-muted);font-style:italic">"${stage.notes}"</div>` : ''}
      <div class="flex gap-8 mt-8">
        <button class="btn btn-ghost btn-sm" onclick="App.editStageDates('${stage.id}')">📅 Editar datas</button>
        <button class="btn btn-ghost btn-sm" onclick="App.editClientReview('${stage.id}')">⏳ Aprovação cliente</button>
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
