const translations = {
  zh: {
    app: {
      title: '歌词缓存管理系统',
      subtitle: '管理本地歌词缓存与开发模式'
    },
    tabs: {
      cache: '📦 缓存管理',
      dev: '🔧 开发文件',
      upload: '⬆️ 上传歌词'
    },
    devMode: {
      label: '轴词实时预览',
      on: '开启',
      off: '关闭',
      enabled: '轴词实时预览已开启',
      disabled: '轴词实时预览已关闭'
    },
    stats: {
      totalFiles: '缓存文件数',
      totalSize: '总大小',
      totalPlays: '总播放次数'
    },
    cache: {
      listTitle: '缓存文件列表',
      emptyTitle: '暂无缓存文件',
      emptyDesc: '上传歌词文件或播放歌曲后会自动缓存'
    },
    dev: {
      listTitle: '开发文件列表 (lyrics-dev)',
      fileCount: '个文件',
      emptyTitle: '开发文件夹为空',
      emptyDesc: '上传TTML文件到开发文件夹进行测试'
    },
    upload: {
      cacheTitle: '上传歌词到缓存',
      devTitle: '上传到开发文件夹',
      clickOrDrag: '点击或拖拽 TTML 文件到此处上传',
      autoDetect: '支持自动从TTML文件解析网易云ID',
      songId: '歌曲 ID (网易云)',
      songIdHint: ' - 可选，留空自动解析',
      selectedFile: '选中的文件',
      toCache: '上传到缓存',
      toDev: '上传到开发文件夹',
      noFile: '请选择文件',
      success: '上传成功',
      failed: '上传失败'
    },
    table: {
      id: 'ID',
      songInfo: '歌曲信息',
      playCount: '播放次数',
      size: '大小',
      source: '来源',
      lastPlayed: '最后播放',
      modifiedAt: '修改时间',
      actions: '操作'
    },
    actions: {
      view: '查看',
      delete: '删除'
    },
    source: {
      main: '主站',
      user: '用户',
      upload: '上传',
      unknown: '未知'
    },
    common: {
      refresh: '刷新',
      loading: '加载中...',
      cancel: '取消',
      confirm: '确认',
      confirmDelete: '确认删除',
      delete: '删除',
      close: '关闭',
      retry: '重试',
      justNow: '刚刚',
      minutesAgo: '分钟前',
      hoursAgo: '小时前',
      daysAgo: '天前'
    },
    modal: {
      deleteCacheTitle: '确认删除缓存',
      deleteCacheMsg: '确定要删除缓存文件 {id} 吗？\n此操作将永久删除该文件，无法撤销。',
      deleteDevTitle: '确认删除开发文件',
      deleteDevMsg: '确定要删除开发文件 {id} 吗？\n此操作将永久删除该文件，无法撤销。',
      deleteSuccess: '删除成功'
    },
    error: {
      networkError: '网络错误，请检查连接',
      fetchFailed: '获取数据失败',
      deleteFailed: '删除失败',
      viewFailed: '查看失败',
      invalidId: 'ID 格式无效',
      invalidFile: '无效的文件格式'
    }
  },
  en: {
    app: {
      title: 'Lyric Cache Admin',
      subtitle: 'Manage local lyric cache and development mode'
    },
    tabs: {
      cache: '📦 Cache',
      dev: '🔧 Dev Files',
      upload: '⬆️ Upload'
    },
    devMode: {
      label: 'Dev Preview',
      on: 'ON',
      off: 'OFF',
      enabled: 'Dev preview enabled',
      disabled: 'Dev preview disabled'
    },
    stats: {
      totalFiles: 'Total Files',
      totalSize: 'Total Size',
      totalPlays: 'Total Plays'
    },
    cache: {
      listTitle: 'Cache Files',
      emptyTitle: 'No cache files',
      emptyDesc: 'Upload lyric files or play songs to auto-cache'
    },
    dev: {
      listTitle: 'Development Files (lyrics-dev)',
      fileCount: 'files',
      emptyTitle: 'Development folder is empty',
      emptyDesc: 'Upload TTML files to dev folder for testing'
    },
    upload: {
      cacheTitle: 'Upload to Cache',
      devTitle: 'Upload to Dev Folder',
      clickOrDrag: 'Click or drag TTML file to upload',
      autoDetect: 'Auto-detect Netease Cloud ID from TTML',
      songId: 'Song ID (Netease)',
      songIdHint: ' - Optional, auto-detect if empty',
      selectedFile: 'Selected file',
      toCache: 'Upload to Cache',
      toDev: 'Upload to Dev Folder',
      noFile: 'Please select a file',
      success: 'Upload successful',
      failed: 'Upload failed'
    },
    table: {
      id: 'ID',
      songInfo: 'Song Info',
      playCount: 'Plays',
      size: 'Size',
      source: 'Source',
      lastPlayed: 'Last Played',
      modifiedAt: 'Modified',
      actions: 'Actions'
    },
    actions: {
      view: 'View',
      delete: 'Delete'
    },
    source: {
      main: 'Main',
      user: 'User',
      upload: 'Upload',
      unknown: 'Unknown'
    },
    common: {
      refresh: 'Refresh',
      loading: 'Loading...',
      cancel: 'Cancel',
      confirm: 'Confirm',
      confirmDelete: 'Delete',
      delete: 'Delete',
      close: 'Close',
      retry: 'Retry',
      justNow: 'Just now',
      minutesAgo: 'm ago',
      hoursAgo: 'h ago',
      daysAgo: 'd ago'
    },
    modal: {
      deleteCacheTitle: 'Confirm Delete Cache',
      deleteCacheMsg: 'Are you sure you want to delete cache file {id}?\nThis action cannot be undone.',
      deleteDevTitle: 'Confirm Delete Dev File',
      deleteDevMsg: 'Are you sure you want to delete dev file {id}?\nThis action cannot be undone.',
      deleteSuccess: 'Deleted successfully'
    },
    error: {
      networkError: 'Network error, please check connection',
      fetchFailed: 'Failed to fetch data',
      deleteFailed: 'Delete failed',
      viewFailed: 'View failed',
      invalidId: 'Invalid ID format',
      invalidFile: 'Invalid file format'
    }
  }
};

const i18n = {
  currentLang: 'zh',
  
  init() {
    const savedLang = localStorage.getItem('lang');
    const browserLang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    this.currentLang = savedLang || browserLang;
    this.applyLanguage();
  },
  
  t(key) {
    const keys = key.split('.');
    let value = translations[this.currentLang];
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        return key;
      }
    }
    return typeof value === 'string' ? value : key;
  },
  
  setLanguage(lang) {
    this.currentLang = lang;
    localStorage.setItem('lang', lang);
    this.applyLanguage();
  },
  
  toggleLanguage() {
    const newLang = this.currentLang === 'zh' ? 'en' : 'zh';
    this.setLanguage(newLang);
    return newLang;
  },
  
  applyLanguage() {
    document.documentElement.setAttribute('data-lang', this.currentLang);
    document.documentElement.lang = this.currentLang === 'zh' ? 'zh-CN' : 'en';
    
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const text = this.t(key);
      if (text) {
        el.textContent = text;
      }
    });
    
    const flagEl = document.getElementById('languageFlag');
    const labelEl = document.getElementById('languageLabel');
    if (flagEl) flagEl.textContent = this.currentLang === 'zh' ? '🇨🇳' : '🇺🇸';
    if (labelEl) labelEl.textContent = this.currentLang === 'zh' ? '中文' : 'EN';
    
    const event = new CustomEvent('languageChanged', { detail: { lang: this.currentLang } });
    document.dispatchEvent(event);
  },
  
  getSourceLabel(source) {
    const key = `source.${source}`;
    return this.t(key);
  }
};

window.i18n = i18n;
