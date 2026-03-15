# Cache Admin UI - Sophisticated Visual Web Application Spec / 歌词缓存管理界面 - 高级视觉Web应用规范

## Why / 背景

The current cache administration interface is embedded directly in the server file with basic styling. A sophisticated, professional-grade web application is needed to provide:
- Enhanced user experience with modern UI/UX design principles
- Bilingual support (Chinese/English) for international accessibility
- Full accessibility compliance (WCAG 2.1 AA)
- Optimized performance for fast load times and smooth interactions
- Professional visual design with CSS Grid and Flexbox layouts
- Beautiful, modern aesthetics inspired by Spotify, Apple Music, and contemporary web design

当前的缓存管理界面直接嵌入在服务器文件中，样式较为基础。需要一个专业级的Web应用来提供：
- 增强的用户体验，遵循现代UI/UX设计原则
- 中英文双语支持，便于国际化访问
- 完整的无障碍访问合规性（WCAG 2.1 AA）
- 优化的性能，实现快速加载和流畅交互
- 使用CSS Grid和Flexbox布局的专业视觉设计
- 灵感来源于Spotify、Apple Music和当代网页设计的优美现代美学

## What Changes / 变更内容

- Create a standalone frontend application with separate HTML, CSS, and JavaScript files
- Implement modern responsive design using CSS Grid and Flexbox
- Add bilingual (Chinese/English) language support with language toggle
- Implement BEM naming convention for CSS architecture
- Create modular JavaScript architecture with separation of concerns
- Add comprehensive accessibility features (ARIA labels, keyboard navigation, focus management)
- Implement loading states, error messages, and success notifications
- Optimize for performance (<3s load time on 4G, 60fps interactions)

- 创建独立的前端应用，分离HTML、CSS和JavaScript文件
- 使用CSS Grid和Flexbox实现现代响应式设计
- 添加中英文双语支持，提供语言切换功能
- 实现BEM命名规范的CSS架构
- 创建模块化JavaScript架构，实现关注点分离
- 添加完整的无障碍功能（ARIA标签、键盘导航、焦点管理）
- 实现加载状态、错误消息和成功通知
- 优化性能（4G网络下<3秒加载，60fps交互）

## Impact / 影响

- Affected specs: Frontend UI, User Experience, Accessibility
- Affected code: 
  - `src/cache-admin-server.ts` (modify to serve static files)
  - New files in `public/` directory for frontend assets

---

## Design System / 设计系统

### Visual Design Philosophy / 视觉设计理念

The design follows modern web aesthetics inspired by:
- **Spotify**: Dark theme with vibrant accent colors, smooth gradients
- **Apple Music**: Clean typography, elegant spacing, glassmorphism effects
- **Linear/Vercel**: Minimalist dark UI with subtle depth and glow effects

设计遵循现代网页美学，灵感来源于：
- **Spotify**：深色主题配合鲜艳强调色，平滑渐变
- **Apple Music**：清晰排版，优雅间距，玻璃拟态效果
- **Linear/Vercel**：极简深色UI，微妙深度和发光效果

### Color Palette / 色彩方案

```css
:root {
  /* Primary Colors / 主色调 - Inspired by Spotify/Apple Music */
  --color-primary: #8b5cf6;           /* Purple - 紫色 */
  --color-primary-light: #a78bfa;     /* Light purple - 浅紫色 */
  --color-primary-dark: #7c3aed;      /* Dark purple - 深紫色 */
  --color-primary-glow: rgba(139, 92, 246, 0.4);  /* Glow effect - 发光效果 */
  
  /* Accent Colors / 强调色 */
  --color-accent: #06b6d4;            /* Cyan - 青色 */
  --color-accent-light: #22d3ee;      /* Light cyan - 浅青色 */
  --color-success: #10b981;           /* Green - 绿色 */
  --color-warning: #f59e0b;           /* Amber - 琥珀色 */
  --color-danger: #ef4444;            /* Red - 红色 */
  
  /* Background Colors / 背景色 - Dark Theme */
  --color-bg-base: #0a0a0f;           /* Darkest - 最深 */
  --color-bg-surface: #121218;        /* Surface - 表面 */
  --color-bg-elevated: #1a1a24;       /* Elevated - 提升 */
  --color-bg-overlay: #222230;        /* Overlay - 覆盖层 */
  
  /* Text Colors / 文字色 */
  --color-text-primary: #f8fafc;      /* Primary text - 主文字 */
  --color-text-secondary: #94a3b8;    /* Secondary text - 次要文字 */
  --color-text-muted: #64748b;        /* Muted text - 弱化文字 */
  
  /* Border & Effects / 边框与效果 */
  --color-border: rgba(255, 255, 255, 0.08);
  --color-border-hover: rgba(255, 255, 255, 0.15);
  --color-glass: rgba(255, 255, 255, 0.03);
  --color-glass-border: rgba(255, 255, 255, 0.1);
  
  /* Gradients / 渐变 */
  --gradient-primary: linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%);
  --gradient-card: linear-gradient(145deg, rgba(139, 92, 246, 0.1) 0%, rgba(6, 182, 212, 0.05) 100%);
  --gradient-glow: radial-gradient(ellipse at top, rgba(139, 92, 246, 0.15) 0%, transparent 50%);
}
```

### Typography / 排版

```css
:root {
  /* Font Families / 字体族 */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', monospace;
  
  /* Font Sizes / 字号 */
  --text-xs: 0.75rem;     /* 12px */
  --text-sm: 0.875rem;    /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg: 1.125rem;    /* 18px */
  --text-xl: 1.25rem;     /* 20px */
  --text-2xl: 1.5rem;     /* 24px */
  --text-3xl: 1.875rem;   /* 30px */
  
  /* Font Weights / 字重 */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  
  /* Line Heights / 行高 */
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;
}
```

### Spacing System / 间距系统

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
}
```

### Shadows & Effects / 阴影与效果

```css
:root {
  /* Shadows / 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -4px rgba(0, 0, 0, 0.4);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 20px rgba(139, 92, 246, 0.3);
  --shadow-glow-lg: 0 0 40px rgba(139, 92, 246, 0.4);
  
  /* Glassmorphism / 玻璃拟态 */
  --glass-blur: blur(12px);
  --glass-bg: rgba(255, 255, 255, 0.05);
  --glass-border: 1px solid rgba(255, 255, 255, 0.1);
  
  /* Transitions / 过渡 */
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;
  --transition-spring: 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
  
  /* Border Radius / 圆角 */
  --radius-sm: 0.375rem;   /* 6px */
  --radius-md: 0.5rem;     /* 8px */
  --radius-lg: 0.75rem;    /* 12px */
  --radius-xl: 1rem;       /* 16px */
  --radius-2xl: 1.5rem;    /* 24px */
  --radius-full: 9999px;
}
```

### Component Design Specifications / 组件设计规范

#### 1. Cards / 卡片

Cards use glassmorphism with subtle gradients and glow effects on hover:

```css
.card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: var(--glass-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  transition: all var(--transition-base);
}

.card:hover {
  border-color: var(--color-border-hover);
  box-shadow: var(--shadow-xl), var(--shadow-glow);
  transform: translateY(-2px);
}
```

#### 2. Buttons / 按钮

Primary buttons feature gradient backgrounds with glow effects:

```css
.btn--primary {
  background: var(--gradient-primary);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-base);
}

.btn--primary:hover {
  box-shadow: var(--shadow-lg), var(--shadow-glow);
  transform: translateY(-1px);
}

.btn--primary:active {
  transform: translateY(0);
}
```

#### 3. Tables / 表格

Modern tables with hover effects and zebra striping:

```css
.table {
  border-collapse: separate;
  border-spacing: 0;
}

.table__row {
  transition: background var(--transition-fast);
}

.table__row:hover {
  background: rgba(139, 92, 246, 0.1);
}

.table__row:nth-child(even) {
  background: rgba(255, 255, 255, 0.02);
}
```

#### 4. Modals / 模态框

Full-screen backdrop with centered glassmorphism modal:

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(4px);
}

.modal {
  background: var(--color-bg-elevated);
  border: var(--glass-border);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
}
```

#### 5. Toast Notifications / Toast通知

Slide-in notifications with colored accents:

```css
.toast {
  background: var(--color-bg-elevated);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  animation: slideInRight 0.3s ease;
}

.toast--success { border-left-color: var(--color-success); }
.toast--error { border-left-color: var(--color-danger); }
.toast--warning { border-left-color: var(--color-warning); }
```

#### 6. Stats Cards / 统计卡片

Large numbers with gradient text and subtle backgrounds:

```css
.stat-card {
  background: var(--gradient-card);
  border: var(--glass-border);
  border-radius: var(--radius-xl);
}

.stat-card__value {
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

#### 7. Toggle Switch / 开关

Smooth toggle with glow effect when active:

```css
.toggle {
  background: var(--color-bg-overlay);
  border-radius: var(--radius-full);
  transition: background var(--transition-base);
}

.toggle--active {
  background: var(--gradient-primary);
  box-shadow: var(--shadow-glow);
}

.toggle__knob {
  background: white;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-md);
  transition: transform var(--transition-spring);
}
```

#### 8. Upload Area / 上传区域

Dashed border with hover glow effect:

```css
.upload-area {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--glass-bg);
  transition: all var(--transition-base);
}

.upload-area:hover,
.upload-area--dragover {
  border-color: var(--color-primary);
  background: rgba(139, 92, 246, 0.1);
  box-shadow: var(--shadow-glow);
}
```

### Animation Guidelines / 动画指南

#### Micro-interactions / 微交互

```css
/* Hover lift effect / 悬停提升效果 */
.interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

/* Click press effect / 点击按压效果 */
.interactive:active {
  transform: translateY(0);
  box-shadow: var(--shadow-sm);
}

/* Focus ring / 焦点环 */
.interactive:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

#### Page Transitions / 页面过渡

```css
/* Fade in animation / 淡入动画 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Slide in from right / 从右侧滑入 */
@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

/* Scale up / 放大 */
@keyframes scaleUp {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
```

---

## ADDED Requirements / 新增需求

### Requirement: Bilingual Support / 需求：双语支持

The system SHALL provide bilingual (Chinese/English) interface with seamless language switching capability.

系统应提供中英文双语界面，支持无缝语言切换。

#### Scenario: Language Toggle / 场景：语言切换
- **WHEN** user clicks the language toggle button / 用户点击语言切换按钮时
- **THEN** all UI text updates to the selected language without page reload / 所有界面文本更新为所选语言，无需重新加载页面

### Requirement: Responsive Design / 需求：响应式设计

The system SHALL implement mobile-first responsive design supporting screen widths from 320px to 1920px.

系统应实现移动优先的响应式设计，支持320px至1920px的屏幕宽度。

#### Scenario: Mobile Display / 场景：移动端显示
- **WHEN** user accesses the application on a mobile device (width < 768px) / 用户在移动设备上访问应用时
- **THEN** the layout adapts with touch-friendly controls and optimized spacing / 布局自适应，提供触摸友好的控件和优化的间距

#### Scenario: Desktop Display / 场景：桌面端显示
- **WHEN** user accesses the application on a desktop device (width >= 1024px) / 用户在桌面设备上访问应用时
- **THEN** the layout utilizes full screen real estate with multi-column layouts / 布局充分利用屏幕空间，采用多列布局

### Requirement: Accessibility Compliance / 需求：无障碍合规

The system SHALL comply with WCAG 2.1 AA standards including:
- Proper heading hierarchy
- ARIA labels for interactive elements
- Keyboard navigation support
- Focus indicators with visible outlines
- Color contrast ratios >= 4.5:1 for normal text, >= 3:1 for large text

系统应符合WCAG 2.1 AA标准，包括：
- 正确的标题层级
- 交互元素的ARIA标签
- 键盘导航支持
- 可见轮廓的焦点指示器
- 普通文字颜色对比度 >= 4.5:1，大文字 >= 3:1

#### Scenario: Keyboard Navigation / 场景：键盘导航
- **WHEN** user navigates using keyboard only / 用户仅使用键盘导航时
- **THEN** all interactive elements are accessible via Tab, Enter, and Escape keys / 所有交互元素可通过Tab、Enter和Escape键访问

### Requirement: Performance Optimization / 需求：性能优化

The system SHALL achieve:
- Initial load time < 3 seconds on 4G connections
- First Contentful Paint < 1.5 seconds
- Interaction response time < 100ms
- Consistent 60fps during animations

系统应实现：
- 4G网络下初始加载时间 < 3秒
- 首次内容绘制 < 1.5秒
- 交互响应时间 < 100ms
- 动画期间保持60fps

#### Scenario: Fast Initial Load / 场景：快速初始加载
- **WHEN** user first accesses the application / 用户首次访问应用时
- **THEN** the main interface is visible and interactive within 3 seconds / 主界面在3秒内可见且可交互

### Requirement: Modern UI Components / 需求：现代UI组件

The system SHALL provide:
- Glassmorphism card-based layouts with subtle shadows and glow effects
- Smooth transitions and micro-interactions with spring animations
- Toast notifications with slide-in animations
- Modal dialogs with backdrop blur
- Loading spinners with gradient colors
- Skeleton screens for loading states
- Empty states with helpful guidance and icons
- Gradient text for important values
- Hover glow effects on interactive elements

系统应提供：
- 带有微妙阴影和发光效果的玻璃拟态卡片布局
- 带有弹性动画的平滑过渡和微交互
- 带有滑入动画的Toast通知
- 带有背景模糊的模态对话框
- 带有渐变色的加载旋转器
- 用于加载状态的骨架屏
- 带有引导提示和图标的空状态
- 重要数值的渐变文字
- 交互元素的悬停发光效果

### Requirement: API Integration / 需求：API集成

The system SHALL integrate with all backend endpoints defined in `cache-admin-server.ts`:

| Endpoint | Method | Description | 描述 |
|----------|--------|-------------|------|
| /api/status | GET | Get system status | 获取系统状态 |
| /api/cache/list | GET | List cache files | 列出缓存文件 |
| /api/cache/:id | DELETE | Delete cache file | 删除缓存文件 |
| /api/cache/file/:id | GET | View cache file | 查看缓存文件 |
| /api/cache/upload | POST | Upload to cache | 上传到缓存 |
| /api/dev-mode | POST | Toggle dev mode | 切换开发模式 |
| /api/dev/list | GET | List dev files | 列出开发文件 |
| /api/dev/upload | POST | Upload to dev | 上传到开发目录 |
| /api/dev/:id | DELETE | Delete dev file | 删除开发文件 |
| /api/dev/file/:id | GET | View dev file | 查看开发文件 |

#### Scenario: API Error Handling / 场景：API错误处理
- **WHEN** an API request fails / API请求失败时
- **THEN** user sees a descriptive error message with retry option / 用户看到描述性错误消息和重试选项

### Requirement: Error Handling / 需求：错误处理

The system SHALL implement comprehensive error handling:
- Network error detection and retry mechanisms
- Validation errors with inline feedback
- Graceful degradation for unsupported browsers
- Error boundary for JavaScript errors

系统应实现全面的错误处理：
- 网络错误检测和重试机制
- 带有内联反馈的验证错误
- 不支持浏览器的优雅降级
- JavaScript错误的错误边界

## MODIFIED Requirements / 修改的需求

### Requirement: Static File Serving / 需求：静态文件服务

The cache-admin-server.ts SHALL serve static frontend files from the `public/` directory instead of embedding HTML inline.

cache-admin-server.ts应从`public/`目录提供静态前端文件，而非内嵌HTML。

## Technical Architecture / 技术架构

### File Structure / 文件结构
```
public/
├── index.html          # Main HTML structure / 主HTML结构
├── css/
│   ├── variables.css   # CSS custom properties / CSS自定义属性
│   ├── reset.css       # CSS reset styles / CSS重置样式
│   ├── base.css        # Base typography & layout / 基础排版和布局
│   ├── components.css  # Component styles / 组件样式
│   └── responsive.css  # Responsive breakpoints / 响应式断点
├── js/
│   ├── app.js          # Application entry point / 应用入口
│   ├── api.js          # API interaction module / API交互模块
│   ├── ui.js           # DOM manipulation module / DOM操作模块
│   ├── i18n.js         # Internationalization module / 国际化模块
│   └── utils.js        # Utility functions / 工具函数
└── assets/
    └── icons/          # SVG icons / SVG图标
```

### CSS Architecture (BEM) / CSS架构（BEM）
```css
/* Block */
.cache-list { }
/* Element */
.cache-list__item { }
.cache-list__header { }
/* Modifier */
.cache-list--empty { }
.cache-list__item--selected { }
```

### JavaScript Modules / JavaScript模块
- **app.js**: Application initialization and coordination
- **api.js**: All backend API communication with error handling
- **ui.js**: DOM manipulation, event handling, component rendering
- **i18n.js**: Language strings and translation management
- **utils.js**: Helper functions (formatting, validation, etc.)
