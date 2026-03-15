const ui = {
  toastContainer: null,
  modalOverlay: null,
  modalTitle: null,
  modalMessage: null,
  modalIcon: null,
  modalConfirmBtn: null,
  modalCancelBtn: null,
  pendingAction: null,
  
  init() {
    this.toastContainer = document.getElementById('toastContainer');
    this.modalOverlay = document.getElementById('confirmModal');
    this.modalTitle = document.getElementById('modalTitle');
    this.modalMessage = document.getElementById('modalMessage');
    this.modalIcon = document.getElementById('modalIcon');
    this.modalConfirmBtn = document.getElementById('modalConfirmBtn');
    this.modalCancelBtn = document.getElementById('modalCancelBtn');
    
    this.modalCancelBtn.addEventListener('click', () => this.closeModal());
    this.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.modalOverlay) {
        this.closeModal();
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalOverlay.classList.contains('modal-overlay--active')) {
        this.closeModal();
      }
    });
  },
  
  showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type} animate-slide-in`;
    
    const icons = {
      success: '✓',
      error: '✗',
      warning: '⚠',
      info: 'ℹ'
    };
    
    toast.innerHTML = `
      <span class="toast__icon">${icons[type]}</span>
      <span class="toast__content">${message}</span>
    `;
    
    this.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.remove('animate-slide-in');
      toast.classList.add('animate-slide-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  
  showModal(title, message, icon = '⚠️', onConfirm = null) {
    this.modalTitle.textContent = title;
    this.modalMessage.textContent = message;
    this.modalIcon.textContent = icon;
    this.pendingAction = onConfirm;
    
    this.modalOverlay.classList.add('modal-overlay--active');
    document.body.style.overflow = 'hidden';
    
    this.modalConfirmBtn.onclick = () => {
      if (this.pendingAction) {
        this.pendingAction();
      }
      this.closeModal();
    };
    
    this.modalConfirmBtn.focus();
  },
  
  closeModal() {
    this.modalOverlay.classList.remove('modal-overlay--active');
    document.body.style.overflow = '';
    this.pendingAction = null;
  },
  
  renderLoading(container) {
    container.innerHTML = `
      <div class="loading" role="status">
        <div class="spinner" aria-hidden="true"></div>
        <span class="sr-only">${i18n.t('common.loading')}</span>
      </div>
    `;
  },
  
  renderEmptyState(container, title, description) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📭</div>
        <h3 class="empty-state__title">${title}</h3>
        <p class="empty-state__description">${description}</p>
      </div>
    `;
  },
  
  renderCacheList(container, files) {
    if (!files || files.length === 0) {
      this.renderEmptyState(
        container, 
        i18n.t('cache.emptyTitle'), 
        i18n.t('cache.emptyDesc')
      );
      return;
    }
    
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const totalPlays = files.reduce((sum, f) => sum + f.playCount, 0);
    
    document.getElementById('totalFiles').textContent = files.length;
    document.getElementById('totalSize').textContent = utils.formatSize(totalSize);
    document.getElementById('totalPlays').textContent = utils.formatNumber(totalPlays);
    
    container.innerHTML = `
      <div class="table-container">
        <table class="table" role="grid">
          <thead>
            <tr>
              <th scope="col">${i18n.t('table.id')}</th>
              <th scope="col">${i18n.t('table.songInfo')}</th>
              <th scope="col">${i18n.t('table.playCount')}</th>
              <th scope="col">${i18n.t('table.size')}</th>
              <th scope="col">${i18n.t('table.source')}</th>
              <th scope="col">${i18n.t('table.lastPlayed')}</th>
              <th scope="col">${i18n.t('table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${files.map(file => this.renderCacheRow(file)).join('')}
          </tbody>
        </table>
      </div>
    `;
  },
  
  renderCacheRow(file) {
    const songInfo = this.renderSongInfo(file.musicName, file.artists);
    const sourceBadge = `<span class="badge ${utils.getSourceClass(file.source)}">${i18n.getSourceLabel(file.source)}</span>`;
    
    return `
      <tr>
        <td class="table__id">${file.id}</td>
        <td>${songInfo}</td>
        <td>${utils.formatNumber(file.playCount)}</td>
        <td class="table__size">${utils.formatSize(file.size)}</td>
        <td>${sourceBadge}</td>
        <td>${utils.formatDate(file.lastPlayedAt)}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn--primary btn--sm" onclick="app.viewCache('${file.id}')" aria-label="View file ${file.id}">
              ${i18n.t('actions.view')}
            </button>
            <button class="btn btn--danger btn--sm" onclick="app.confirmDeleteCache('${file.id}')" aria-label="Delete file ${file.id}">
              ${i18n.t('actions.delete')}
            </button>
          </div>
        </td>
      </tr>
    `;
  },
  
  renderDevList(container, files) {
    if (!files || files.length === 0) {
      this.renderEmptyState(
        container, 
        i18n.t('dev.emptyTitle'), 
        i18n.t('dev.emptyDesc')
      );
      document.getElementById('devCount').textContent = `0 ${i18n.t('dev.fileCount')}`;
      return;
    }
    
    document.getElementById('devCount').textContent = `${files.length} ${i18n.t('dev.fileCount')}`;
    
    container.innerHTML = `
      <div class="table-container">
        <table class="table" role="grid">
          <thead>
            <tr>
              <th scope="col">${i18n.t('table.id')}</th>
              <th scope="col">${i18n.t('table.songInfo')}</th>
              <th scope="col">${i18n.t('table.size')}</th>
              <th scope="col">${i18n.t('table.modifiedAt')}</th>
              <th scope="col">${i18n.t('table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            ${files.map(file => this.renderDevRow(file)).join('')}
          </tbody>
        </table>
      </div>
    `;
  },
  
  renderDevRow(file) {
    const songInfo = this.renderSongInfo(file.musicName, file.artists);
    
    return `
      <tr>
        <td class="table__id">${file.id}</td>
        <td>${songInfo}</td>
        <td class="table__size">${utils.formatSize(file.size)}</td>
        <td>${utils.formatDate(file.modifiedAt)}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn--primary btn--sm" onclick="app.viewDevFile('${file.id}')" aria-label="View file ${file.id}">
              ${i18n.t('actions.view')}
            </button>
            <button class="btn btn--danger btn--sm" onclick="app.confirmDeleteDev('${file.id}')" aria-label="Delete file ${file.id}">
              ${i18n.t('actions.delete')}
            </button>
          </div>
        </td>
      </tr>
    `;
  },
  
  renderSongInfo(musicName, artists) {
    if (!musicName && !artists) {
      return '<span class="text-muted">-</span>';
    }
    
    let html = '<div>';
    if (musicName && musicName.length > 0) {
      html += `<div class="table__song-name">${utils.escapeHtml(musicName[0])}</div>`;
    }
    if (artists && artists.length > 0) {
      const artistStr = artists.slice(0, 3).join(' / ');
      const more = artists.length > 3 ? '...' : '';
      html += `<div class="table__song-artists">${utils.escapeHtml(artistStr)}${more}</div>`;
    }
    html += '</div>';
    return html;
  },
  
  updateDevModeUI(enabled) {
    const toggle = document.getElementById('devModeSwitch');
    
    if (enabled) {
      toggle.classList.add('toggle--active');
      toggle.setAttribute('aria-checked', 'true');
    } else {
      toggle.classList.remove('toggle--active');
      toggle.setAttribute('aria-checked', 'false');
    }
  },
  
  switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.classList.remove('tab--active');
      tab.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('tab-content--active');
      content.hidden = true;
    });
    
    const activeTab = document.querySelector(`[data-tab="${tabId}"]`);
    const activeContent = document.getElementById(`panel-${tabId}`);
    
    if (activeTab && activeContent) {
      activeTab.classList.add('tab--active');
      activeTab.setAttribute('aria-selected', 'true');
      activeContent.classList.add('tab-content--active');
      activeContent.hidden = false;
    }
  },
  
  setupUploadArea(areaId, inputId, selectedFileId) {
    const area = document.getElementById(areaId);
    const input = document.getElementById(inputId);
    const selectedFile = document.getElementById(selectedFileId);
    
    if (!area || !input || !selectedFile) return;
    
    area.addEventListener('click', () => input.click());
    area.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    
    area.addEventListener('dragover', (e) => {
      e.preventDefault();
      area.classList.add('upload-area--dragover');
    });
    
    area.addEventListener('dragleave', () => {
      area.classList.remove('upload-area--dragover');
    });
    
    area.addEventListener('drop', (e) => {
      e.preventDefault();
      area.classList.remove('upload-area--dragover');
      
      const file = e.dataTransfer.files[0];
      if (file) {
        input.files = e.dataTransfer.files;
        selectedFile.value = file.name;
        selectedFile.dispatchEvent(new Event('change'));
      }
    });
    
    input.addEventListener('change', () => {
      if (input.files[0]) {
        selectedFile.value = input.files[0].name;
      }
    });
  }
};

window.ui = ui;
