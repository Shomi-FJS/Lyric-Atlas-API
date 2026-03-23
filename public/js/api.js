const api = {
  baseUrl: '/api',
  timeout: 10000,
  maxRetries: 3,
  
  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  },
  
  async request(endpoint, options = {}, retryCount = 0) {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      if (response.headers.get('content-type')?.includes('application/json')) {
        return response.json();
      }
      return response;
    } catch (error) {
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        await utils.sleep(1000 * (retryCount + 1));
        return this.request(endpoint, options, retryCount + 1);
      }
      throw error;
    }
  },
  
  shouldRetry(error) {
    return error.message === 'Request timeout' || 
           error.message === 'NetworkError' ||
           error.message.includes('Failed to fetch');
  },
  
  async getStatus() {
    return this.request('/status');
  },
  
  async getCacheList() {
    return this.request('/cache/list');
  },
  
  async getCacheFile(id) {
    if (!utils.validateId(id)) {
      throw new Error(i18n.t('error.invalidId'));
    }
    const response = await this.fetchWithTimeout(`${this.baseUrl}/cache/file/${id}`);
    if (!response.ok) {
      throw new Error(i18n.t('error.viewFailed'));
    }
    return response.text();
  },
  
  async deleteCache(id) {
    if (!utils.validateId(id)) {
      throw new Error(i18n.t('error.invalidId'));
    }
    return this.request(`/cache/${id}`, { method: 'DELETE' });
  },
  
  async uploadToCache(file, id = null) {
    if (!utils.validateFileType(file)) {
      throw new Error(i18n.t('error.invalidFile'));
    }
    
    const formData = new FormData();
    formData.append('file', file);
    if (id) {
      formData.append('id', id);
    }
    
    const response = await this.fetchWithTimeout(`${this.baseUrl}/cache/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || i18n.t('upload.failed'));
    }
    
    return response.json();
  },
  
  async toggleDevMode(enabled) {
    return this.request('/dev-mode', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    });
  },

  async rebuildMeta() {
    return this.request('/cache/rebuild-meta', { method: 'POST' });
  },

  async updateRemote() {
    return this.request('/cache/update-remote', { method: 'POST' });
  },

  async rebuildFromIds() {
    return this.request('/cache/rebuild-from-ids', { method: 'POST' });
  },
  
  async getDevList() {
    return this.request('/dev/list');
  },
  
  async getDevFile(id) {
    if (!utils.validateId(id)) {
      throw new Error(i18n.t('error.invalidId'));
    }
    const response = await this.fetchWithTimeout(`${this.baseUrl}/dev/file/${id}`);
    if (!response.ok) {
      throw new Error(i18n.t('error.viewFailed'));
    }
    return response.text();
  },
  
  async deleteDevFile(id) {
    if (!utils.validateId(id)) {
      throw new Error(i18n.t('error.invalidId'));
    }
    return this.request(`/dev/${id}`, { method: 'DELETE' });
  },
  
  async uploadToDev(file, id = null) {
    if (!utils.validateFileType(file)) {
      throw new Error(i18n.t('error.invalidFile'));
    }
    
    const formData = new FormData();
    formData.append('file', file);
    if (id) {
      formData.append('id', id);
    }
    
    const response = await this.fetchWithTimeout(`${this.baseUrl}/dev/upload`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || i18n.t('upload.failed'));
    }
    
    return response.json();
  }
};

window.api = api;
