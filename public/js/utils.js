const utils = {
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  },
  
  formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return i18n.t('common.justNow');
    if (diff < 3600000) return Math.floor(diff / 60000) + i18n.t('common.minutesAgo');
    if (diff < 86400000) return Math.floor(diff / 3600000) + i18n.t('common.hoursAgo');
    if (diff < 604800000) return Math.floor(diff / 86400000) + i18n.t('common.daysAgo');
    
    return date.toLocaleDateString(i18n.currentLang === 'zh' ? 'zh-CN' : 'en-US');
  },
  
  formatNumber(num) {
    if (num === undefined || num === null) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  },
  
  validateId(id) {
    if (!id) return false;
    return /^\d+$/.test(id);
  },
  
  validateFileType(file) {
    if (!file) return false;
    const validTypes = ['.ttml', '.xml'];
    const fileName = file.name.toLowerCase();
    return validTypes.some(ext => fileName.endsWith(ext));
  },
  
  debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  },
  
  throttle(fn, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  truncate(str, maxLength) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  },
  
  getSourceClass(source) {
    const sourceMap = {
      main: 'badge--main',
      user: 'badge--user',
      upload: 'badge--upload',
      unknown: 'badge--unknown'
    };
    return sourceMap[source] || 'badge--unknown';
  },
  
  generateId() {
    return Math.random().toString(36).substring(2, 11);
  },
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return Promise.resolve();
    } catch (err) {
      return Promise.reject(err);
    } finally {
      document.body.removeChild(textarea);
    }
  }
};

window.utils = utils;
