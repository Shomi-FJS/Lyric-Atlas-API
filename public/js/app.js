const app = {
  devModeEnabled: false,
  selectedFile: null,
  devSelectedFile: null,
  currentTheme: 'light',
  
  async init() {
    i18n.init();
    ui.init();
    
    this.initTheme();
    await this.loadStatus();
    await this.loadCacheList();
    await this.loadDevList();
    
    this.setupEventListeners();
  },
  
  initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.setTheme(savedTheme);
    } else {
      this.autoSetThemeByTime();
    }
    this.startAutoThemeCheck();
  },
  
  autoSetThemeByTime() {
    const hour = new Date().getHours();
    const isDark = hour >= 18 || hour < 6;
    this.setTheme(isDark ? 'dark' : 'light');
  },
  
  startAutoThemeCheck() {
    setInterval(() => {
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme) {
        this.autoSetThemeByTime();
      }
    }, 60000);
  },
  
  setTheme(theme) {
    this.currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    this.updateThemeIcon();
  },
  
  updateThemeIcon() {
    const iconEl = document.getElementById('themeIcon');
    iconEl.textContent = this.currentTheme === 'dark' ? '🌙' : '☀️';
  },
  
  toggleTheme() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
  },
  
  setupEventListeners() {
    this.setupTabNavigation();
    this.setupDevModeToggle();
    this.setupUploadAreas();
    this.setupLanguageToggle();
    this.setupThemeToggle();
    this.setupRefreshButton();
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.modalOverlay.classList.contains('modal-overlay--active')) {
        ui.closeModal();
      }
    });
  },
  
  setupTabNavigation() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab');
        ui.switchTab(tabId);
      });
      
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const tabId = tab.getAttribute('data-tab');
          ui.switchTab(tabId);
        }
      });
    });
  },
  
  setupDevModeToggle() {
    const toggle = document.getElementById('devModeSwitch');
    toggle.addEventListener('click', () => this.toggleDevMode());
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleDevMode();
      }
    });
  },
  
  setupUploadAreas() {
    ui.setupUploadArea('uploadArea', 'fileInput', 'selectedFile');
    ui.setupUploadArea('devUploadArea', 'devFileInput', 'devSelectedFile');
    
    document.getElementById('fileInput').addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.selectedFile = e.target.files[0];
      }
    });
    
    document.getElementById('devFileInput').addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.devSelectedFile = e.target.files[0];
      }
    });
    
    document.getElementById('uploadToCacheBtn').addEventListener('click', () => this.uploadToCache());
    document.getElementById('uploadToDevBtn').addEventListener('click', () => this.uploadToDev());
  },
  
  setupLanguageToggle() {
    const toggle = document.getElementById('languageToggle');
    toggle.addEventListener('click', () => {
      i18n.toggleLanguage();
    });
  },
  
  setupThemeToggle() {
    const toggle = document.getElementById('themeToggle');
    toggle.addEventListener('click', () => this.toggleTheme());
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggleTheme();
      }
    });
  },
  
  setupRefreshButton() {
    const btn = document.getElementById('refreshCacheBtn');
    btn.addEventListener('click', () => this.loadCacheList());
  },
  
  async loadStatus() {
    try {
      const data = await api.getStatus();
      this.devModeEnabled = data.devModeEnabled;
      ui.updateDevModeUI(this.devModeEnabled);
    } catch (err) {
      ui.showToast(i18n.t('error.fetchFailed'), 'error');
    }
  },
  
  async loadCacheList() {
    const container = document.getElementById('cacheList');
    ui.renderLoading(container);
    
    try {
      const data = await api.getCacheList();
      
      if (!data.success) {
        throw new Error(data.error);
      }
      
      ui.renderCacheList(container, data.files);
    } catch (err) {
      ui.showToast(i18n.t('error.fetchFailed'), 'error');
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">⚠️</div>
          <h3 class="empty-state__title">${i18n.t('error.fetchFailed')}</h3>
          <p class="empty-state__description">${err.message}</p>
        </div>
      `;
    }
  },
  
  async loadDevList() {
    const container = document.getElementById('devList');
    ui.renderLoading(container);
    
    try {
      const data = await api.getDevList();
      
      if (!data.success) {
        throw new Error(data.error);
      }
      
      document.getElementById('devCount').textContent = 
        `${data.files.length} ${i18n.t('dev.fileCount')}`;
      ui.renderDevList(container, data.files);
    } catch (err) {
      ui.showToast(i18n.t('error.fetchFailed'), 'error');
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">⚠️</div>
          <h3 class="empty-state__title">${i18n.t('error.fetchFailed')}</h3>
          <p class="empty-state__description">${err.message}</p>
        </div>
      `;
    }
  },
  
  async toggleDevMode() {
    try {
      const data = await api.toggleDevMode(!this.devModeEnabled);
      this.devModeEnabled = data.devModeEnabled;
      ui.updateDevModeUI(this.devModeEnabled);
      ui.showToast(
        this.devModeEnabled ? i18n.t('devMode.enabled') : i18n.t('devMode.disabled'),
        'success'
      );
    } catch (err) {
      ui.showToast(i18n.t('error.networkError'), 'error');
    }
  },
  
  async viewCache(id) {
    try {
      const content = await api.getCacheFile(id);
      const blob = new Blob([content], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      ui.showToast(i18n.t('error.viewFailed'), 'error');
    }
  },
  
  async viewDevFile(id) {
    try {
      const content = await api.getDevFile(id);
      const blob = new Blob([content], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      ui.showToast(i18n.t('error.viewFailed'), 'error');
    }
  },
  
  confirmDeleteCache(id) {
    ui.showModal(
      i18n.t('modal.deleteCacheTitle'),
      i18n.t('modal.deleteCacheMsg').replace('{id}', id),
      '🗑️',
      async () => {
        try {
          const data = await api.deleteCache(id);
          if (data.success) {
            ui.showToast(i18n.t('modal.deleteSuccess'), 'success');
            await this.loadCacheList();
          } else {
            ui.showToast(data.error || i18n.t('error.deleteFailed'), 'error');
          }
        } catch (err) {
          ui.showToast(i18n.t('error.deleteFailed'), 'error');
        }
      }
    );
  },
  
  confirmDeleteDev(id) {
    ui.showModal(
      i18n.t('modal.deleteDevTitle'),
      i18n.t('modal.deleteDevMsg').replace('{id}', id),
      '🗑️',
      async () => {
        try {
          const data = await api.deleteDevFile(id);
          if (data.success) {
            ui.showToast(i18n.t('modal.deleteSuccess'), 'success');
            await this.loadDevList();
          } else {
            ui.showToast(data.error || i18n.t('error.deleteFailed'), 'error');
          }
        } catch (err) {
          ui.showToast(i18n.t('error.deleteFailed'), 'error');
        }
      }
    );
  },
  
  async uploadToCache() {
    const id = document.getElementById('uploadId').value.trim();
    
    if (!this.selectedFile) {
      ui.showToast(i18n.t('upload.noFile'), 'error');
      return;
    }
    
    try {
      const data = await api.uploadToCache(this.selectedFile, id || null);
      let message = `${i18n.t('upload.success')} (ID: ${data.id})`;
      if (data.musicName && data.musicName.length > 0) {
        message += ` - ${data.musicName[0]}`;
        if (data.artists && data.artists.length > 0) {
          message += ` / ${data.artists[0]}`;
        }
      }
      ui.showToast(message, 'success');
      
      document.getElementById('uploadId').value = '';
      document.getElementById('selectedFile').value = '';
      document.getElementById('fileInput').value = '';
      this.selectedFile = null;
      
      await this.loadCacheList();
    } catch (err) {
      ui.showToast(err.message || i18n.t('upload.failed'), 'error');
    }
  },
  
  async uploadToDev() {
    const id = document.getElementById('devUploadId').value.trim();
    
    if (!this.devSelectedFile) {
      ui.showToast(i18n.t('upload.noFile'), 'error');
      return;
    }
    
    try {
      const data = await api.uploadToDev(this.devSelectedFile, id || null);
      let message = `${i18n.t('upload.success')} (ID: ${data.id})`;
      if (data.musicName && data.musicName.length > 0) {
        message += ` - ${data.musicName[0]}`;
        if (data.artists && data.artists.length > 0) {
          message += ` / ${data.artists[0]}`;
        }
      }
      ui.showToast(message, 'success');
      
      document.getElementById('devUploadId').value = '';
      document.getElementById('devSelectedFile').value = '';
      document.getElementById('devFileInput').value = '';
      this.devSelectedFile = null;
      
      await this.loadDevList();
    } catch (err) {
      ui.showToast(err.message || i18n.t('upload.failed'), 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

window.app = app;
