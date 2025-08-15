// manager 页面脚本：独立管理界面，展示所有书签并提供整理工具

const IS_EXT = typeof chrome !== 'undefined' && !!chrome.runtime;
let g_allBookmarks = []; // 展示用途的扁平化书签
let g_folders = []; // 文件夹列表（扁平化）
let g_foldersTree = []; // 文件夹树结构（保持层级）
let g_pageSize = 100;
let g_currentPage = 1;
let g_showUrlInList = true;

/**
 * init
 * 中文说明：入口，初始化导航、加载设置与数据，默认仅渲染列表视图
 */
async function init() {
  bindNav();
  bindControls();
  await loadSettings();
  await loadFolders();
  await loadAllBookmarks();
  renderOverview();
  renderBookmarks(); // 默认渲染列表视图
  // 移除 renderTree()，改为懒加载，仅在切换到树视图时渲染
  refreshToolFolderSelect();
  initBatchOperations();
  // 默认显示概览面板
  switchPanel('panelOverview');
}

/**
 * bindNav
 * 中文说明：绑定顶部导航切换与事件委托
 */
function bindNav() {
  const ids = [
    ['navOverview', 'panelOverview'],
    ['navBookmarks', 'panelBookmarks'],
    ['navSettings', 'panelSettings']
  ];
  ids.forEach(([btnId, panelId]) => {
    document.getElementById(btnId).addEventListener('click', () => switchPanel(panelId));
  });
  
  // 绑定开始管理按钮
  document.getElementById('btnStartManage')?.addEventListener('click', () => switchPanel('panelBookmarks'));
  
  // 事件委托：处理书签相关的所有事件（仅监听可见的列表容器中的复选框）
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('bookmark-checkbox')) {
      updateBatchOperations();
    } else if (e.target.classList.contains('single-move-select')) {
      onSingleBookmarkMove(e.target);
    }
  });
  
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-single-delete')) {
      const bookmarkId = e.target.dataset.bookmarkId;
      onSingleBookmarkDelete(bookmarkId);
    }
  });
}

/**
 * bindControls
 * 中文说明：绑定页面控件事件（搜索、分页、工具、视图切换等）
 */
function bindControls() {
  document.getElementById('btnSearch').addEventListener('click', () => { 
    // 搜索应更新当前可见的视图
    const currentView = getCurrentViewMode();
    if (currentView === 'list') {
      renderBookmarks(true);
    } else {
      renderTree();
    }
  });
  document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { 
      // 回车触发搜索
      const currentView = getCurrentViewMode();
      if (currentView === 'list') {
        renderBookmarks(true);
      } else {
        renderTree();
      }
    }
  });
  document.getElementById('btnRefresh').addEventListener('click', async () => { 
    await loadAllBookmarks(); 
    // 刷新后仅更新当前可见的视图
    const currentView = getCurrentViewMode();
    if (currentView === 'list') {
      renderBookmarks(true);
    } else {
      renderTree();
    }
    refreshToolFolderSelect();
    loadBatchMoveFolderOptions();
  });

  // 新增：快速清理按钮（清空搜索并重置分页）
  const quickCleanBtn = document.getElementById('btnQuickClean');
  if (quickCleanBtn) {
    quickCleanBtn.addEventListener('click', () => {
      // 中文说明：快速清理只做无副作用操作——清空搜索输入与重置分页
      const si = document.getElementById('searchInput');
      if (si) si.value = '';
      g_currentPage = 1;
      const currentView = getCurrentViewMode();
      if (currentView === 'list') {
        renderBookmarks(true);
      } else {
        renderTree();
      }
      message('已清空搜索并重置分页');
    });
  }

  // 视图切换按钮绑定
  const btnListView = document.getElementById('btnListView');
  const btnTreeView = document.getElementById('btnTreeView');
  if (btnListView) {
    btnListView.addEventListener('click', () => switchViewMode('list'));
  }
  if (btnTreeView) {
    btnTreeView.addEventListener('click', () => switchViewMode('tree'));
  }

  // 分页事件绑定
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  if (btnPrevPage) {
    btnPrevPage.addEventListener('click', () => {
      if (g_currentPage > 1) {
        g_currentPage -= 1;
        renderBookmarks(false);
      }
    });
  }
  if (btnNextPage) {
    btnNextPage.addEventListener('click', () => {
      const list = filteredBookmarks();
      const maxPage = Math.max(1, Math.ceil(list.length / g_pageSize));
      if (g_currentPage < maxPage) {
        g_currentPage += 1;
        renderBookmarks(false);
      }
    });
  }

  // 每页条数变更
  const pageSizeSelect = document.getElementById('pageSize');
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', () => {
      const val = parseInt(pageSizeSelect.value, 10);
      if (!Number.isNaN(val) && val > 0) {
        g_pageSize = val;
        g_currentPage = 1;
        renderBookmarks(true);
      }
    });
  }

  // 设置区
  document.getElementById('btnSaveSettings').addEventListener('click', onSaveSettings);
  document.getElementById('enableLinkCheckSetting').addEventListener('change', () => refreshToolButtons());
}

/**
 * loadSettings
 * 中文说明：从 storage 读取设置，刷新设置面板与全局参数
 */
async function loadSettings() {
  if (!IS_EXT || !chrome.storage?.sync?.get) return;
  const { enableLinkCheck = true } = await chrome.storage.sync.get(['enableLinkCheck']);
  document.getElementById('enableLinkCheckSetting').checked = !!enableLinkCheck;
}

/**
 * loadFolders
 * 中文说明：加载全部文件夹，用于书签浏览筛选与工具目标选择
 */
async function loadFolders() {
  if (!IS_EXT || !chrome.bookmarks?.getTree) {
    g_folders = [{ id: 'demo', title: '[预览] 示例文件夹' }];
    g_foldersTree = [{ id: 'demo', title: '[预览] 示例文件夹', children: [] }];
    refreshToolFolderSelect();
    return;
  }
  const tree = await chrome.bookmarks.getTree();
  
  // 保存层级结构的文件夹树
  function extractFoldersTree(nodes) {
    return nodes.filter(node => !node.url).map(node => ({
      id: node.id,
      title: node.title || '(无标题)',
      children: node.children ? extractFoldersTree(node.children) : []
    }));
  }
  g_foldersTree = extractFoldersTree(tree || []);
  
  // 保存扁平化的文件夹列表（用于现有功能）
  const list = [];
  const stack = [...(tree || [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (!node.url) list.push({ id: node.id, title: node.title || '(无标题)' });
    if (node.children) node.children.forEach(ch => stack.push(ch));
  }
  g_folders = list;
  
  // 书签浏览的过滤器（如果存在的话）
  const folderFilter = document.getElementById('folderFilter');
  if (folderFilter) {
    folderFilter.innerHTML = '<option value="">所有文件夹</option>' + list.map(f => `<option value="${f.id}">${escapeHtml(f.title)}</option>`).join('');
  }
  refreshToolFolderSelect();
}

/**
 * refreshToolFolderSelect
 * 中文说明：刷新工具区文件夹选择与按钮可用性
 */
function refreshToolFolderSelect() {
  const sel = document.getElementById('toolFolderSelect');
  sel.innerHTML = '<option value="">请选择文件夹</option>' + g_folders.map(f => `<option value="${f.id}">${escapeHtml(f.title)}</option>`).join('');
  refreshToolButtons();
}

/**
 * refreshToolButtons
 * 中文说明：根据是否选择文件夹与开关状态来控制工具按钮
 */
async function refreshToolButtons() {
  const has = !!document.getElementById('toolFolderSelect').value;
  const canLC = await getLinkCheckEnabled();
  document.getElementById('btnDedupPreview').disabled = !has;
  document.getElementById('btnApplyDedup').disabled = true;
  document.getElementById('btnUndo').disabled = false;
  document.getElementById('btnLinkCheck').disabled = !has || !canLC;
  const smartBtn = document.getElementById('btnSmartOrganize');
  if (smartBtn) smartBtn.disabled = !has;
  
  // AI整理按钮状态控制
  const aiPreviewBtn = document.getElementById('btnAiOrganizePreview');
  const aiApplyBtn = document.getElementById('btnAiOrganizeApply');
  if (aiPreviewBtn) aiPreviewBtn.disabled = !has;
  if (aiApplyBtn) aiApplyBtn.disabled = !has;
}

/**
 * loadAllBookmarks
 * 中文说明：加载所有书签为扁平列表，供“书签浏览”使用
 */
async function loadAllBookmarks() {
  const list = [];
  if (!IS_EXT || !chrome.bookmarks?.getTree) {
    // 预览占位
    for (let i = 1; i <= 120; i++) list.push({ id: `demo-${i}`, title: `示例书签 ${i}`, url: `https://example.com/${i}`, parentId: 'demo' });
    g_allBookmarks = list; return;
  }
  const tree = await chrome.bookmarks.getTree();
  const stack = [...(tree || [])];
  while (stack.length) {
    const node = stack.pop();
    if (!node) continue;
    if (node.url) list.push({ id: node.id, title: node.title || '', url: node.url, parentId: node.parentId });
    if (node.children) node.children.forEach(ch => stack.push(ch));
  }
  g_allBookmarks = list;
}

/**
 * filteredBookmarks
 * 中文说明：按搜索关键字与文件夹过滤列表
 */
function filteredBookmarks() {
  const searchInput = document.getElementById('searchInput');
  const folderFilter = document.getElementById('folderFilter');
  
  const q = (searchInput?.value || '').toLowerCase();
  const fid = folderFilter?.value || '';
  
  return g_allBookmarks.filter(b => {
    const okQ = !q || (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q);
    const okF = !fid || b.parentId === fid;
    return okQ && okF;
  });
}

/**
 * renderOverview
 * 中文说明：渲染顶部“概览”统计
 */
function renderOverview() {
  const total = g_allBookmarks.length;
  const folders = g_folders.length;
  document.getElementById('totalBookmarks').textContent = String(total);
  document.getElementById('totalFolders').textContent = String(folders);
  
  // 初始化重复和断链数量，工具执行后会更新
  const duplicateElement = document.getElementById('duplicateCount');
  const brokenElement = document.getElementById('brokenLinks');
  
  if (duplicateElement && duplicateElement.textContent === '-') {
    duplicateElement.textContent = '0';
  }
  if (brokenElement && brokenElement.textContent === '-') {
    brokenElement.textContent = '0';
  }
}

/**
 * renderBookmarks
 * 中文说明：渲染“书签浏览”面板列表到专用列表容器，支持分页与是否展示 URL
 */
function renderBookmarks(resetPageInfo = false) {
  const list = filteredBookmarks();

  // 使用分离的列表容器
  const container = document.getElementById('listViewContainer');
  if (!container) {
    console.warn('listViewContainer not found');
    return;
  }
  
  if (!list || list.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>未找到书签</p></div>';
    const btnPrevPage = document.getElementById('btnPrevPage');
    const btnNextPage = document.getElementById('btnNextPage');
    const pageInfo = document.getElementById('pageInfo');
    if (btnPrevPage) btnPrevPage.disabled = true;
    if (btnNextPage) btnNextPage.disabled = true;
    if (pageInfo) pageInfo.textContent = '共 0 条';
    // 新增：渲染空状态后同步批量操作状态
    updateBatchOperations();
    return;
  }

  // 传统分页信息仍然可用，分页按钮用于跳转到对应数据段
  const maxPage = Math.max(1, Math.ceil(list.length / g_pageSize));
  if (resetPageInfo) g_currentPage = 1;
  if (g_currentPage > maxPage) g_currentPage = maxPage;

  // 简化为直接渲染书签列表
  const startIndex = (g_currentPage - 1) * g_pageSize;
  const endIndex = Math.min(startIndex + g_pageSize, list.length);
  const pageList = list.slice(startIndex, endIndex);
  
  const html = pageList.map(b => {
    const folderName = g_folders.find(f => f.id === b.parentId)?.title || '未知文件夹';
    return `
      <div class="bookmark-item" data-id="${b.id}">
        <div class="bookmark-content">
          <input type="checkbox" class="bookmark-checkbox" data-bookmark-id="${b.id}" />
          <div class="bookmark-info">
            <div class="bookmark-title"><a href="${escapeHtml(b.url)}" target="_blank">${escapeHtml(b.title || '无标题')}</a></div>
            ${g_showUrlInList ? `<div class="bookmark-url">${escapeHtml(b.url || '')}</div>` : ''}
            <div class="bookmark-folder">📁 ${escapeHtml(folderName)}</div>
          </div>
        </div>
        <div class="bookmark-actions">
          <select class="single-move-select modern-select" data-bookmark-id="${b.id}">
            <option value="">移动到...</option>
            ${generateFolderOptions()}
          </select>
          <button class="btn-single-delete" data-bookmark-id="${b.id}">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
  
  // 更新分页信息
  const pageInfo = document.getElementById('pageInfo');
  if (pageInfo) {
    pageInfo.textContent = `第 ${g_currentPage} 页，共 ${maxPage} 页，总计 ${list.length} 条`;
  }
  
  // 更新分页按钮状态
  const btnPrevPage = document.getElementById('btnPrevPage');
  const btnNextPage = document.getElementById('btnNextPage');
  if (btnPrevPage) btnPrevPage.disabled = g_currentPage <= 1;
  if (btnNextPage) btnNextPage.disabled = g_currentPage >= maxPage;

  // 新增：列表渲染完成后，统一刷新批量操作状态（全选、计数、按钮禁用）
  updateBatchOperations();
}

/**
 * onDedupPreview
 * 中文说明：调用后台生成去重预览，渲染到“整理工具”面板
 */
async function onDedupPreview() {
  const fid = document.getElementById('toolFolderSelect').value;
  if (!fid) return message('请先选择目标文件夹');
  if (!IS_EXT || !chrome.runtime?.sendMessage) return message('预览模式不支持去重');
  
  // 设置按钮加载状态
  const btn = document.getElementById('btnDedupPreview');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '分析中...';
  btn.classList.add('loading');
  
  document.getElementById('btnApplyDedup').disabled = true;
  message('📊 正在分析书签，生成去重预览...');
  
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'DEDUP_PREVIEW', payload: { folderId: fid } });
    if (!resp?.ok) throw new Error(resp?.error || '未知错误');
    const groups = resp.data.groups || [];
    const cont = document.getElementById('dedupResult');
    if (!groups.length) { 
      cont.innerHTML = '<div class="tool-card">✅ 未发现重复书签</div>'; 
      message('🎉 未发现重复书签');
      return; 
    }
    cont.innerHTML = groups.map((g, gi) => `
      <div class="tool-card">
        <h4>重复组 #${gi + 1} · ${escapeHtml(g.normalizedUrl)}</h4>
        ${g.items.map(it => `
          <label class="row">
            <input type="checkbox" data-id="${it.id}" ${it.keep ? 'disabled' : ''} />
            <span>${it.keep ? '保留' : '删除'}</span> · ${escapeHtml(it.title || '(无标题)')}
          </label>`).join('')}
      </div>`).join('');
    // 启用"执行删除"按钮，并把 groups 暂存到元素上
    cont.dataset.groups = JSON.stringify(groups);
    document.getElementById('btnApplyDedup').disabled = false;
    message(`📋 发现 ${groups.length} 组重复书签`);
  } catch (e) {
    message('❌ 生成预览失败：' + e.message);
  } finally {
    // 恢复按钮状态
    btn.disabled = false;
    btn.textContent = originalText;
    btn.classList.remove('loading');
  }
}

/**
 * onApplyDedup
 * 中文说明：读取勾选项，调用后台执行删除
 */
async function onApplyDedup() {
  const cont = document.getElementById('dedupResult');
  const groups = JSON.parse(cont.dataset.groups || '[]');
  if (!groups.length) return message('请先生成去重预览');
  if (!IS_EXT || !chrome.runtime?.sendMessage) return message('预览模式不支持删除');
  const checkedIds = Array.from(document.querySelectorAll('#dedupResult input[type="checkbox"]:checked')).map(el => el.getAttribute('data-id'));
  const toDelete = [];
  groups.forEach(g => g.items.forEach(it => { if (checkedIds.includes(String(it.id))) toDelete.push(it); }));
  if (!toDelete.length) return message('未选择待删除项');
  
  // 显示删除进度状态
  const btn = document.getElementById('btnApplyDedup');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '删除中...';
  btn.classList.add('loading');
  
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'DEDUP_APPLY', payload: { toDeleteItems: toDelete } });
    if (!resp?.ok) throw new Error(resp?.error || '未知错误');
    message(`✅ 已删除 ${resp.result.deleted} 项`);
    
    // 删除成功后自动刷新书签列表和去重预览
    await loadAllBookmarks();
    renderBookmarks(true);
    renderTree();
    
    // 清空去重结果并重新生成预览
    cont.innerHTML = '';
    cont.dataset.groups = '';
    setTimeout(() => {
      message('📝 正在重新生成去重预览...');
      onDedupPreview();
    }, 500);
    
  } catch (e) { 
    message('❌ 删除失败：' + e.message); 
  } finally {
    // 恢复按钮状态
    btn.disabled = false;
    btn.textContent = originalText;
    btn.classList.remove('loading');
  }
}

/**
 * onUndo
 * 中文说明：撤销最近一次删除操作
 */
async function onUndo() {
  if (!IS_EXT || !chrome.runtime?.sendMessage) return message('预览模式不支持撤销');
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'UNDO_LAST_ACTION' });
    if (!resp?.ok) throw new Error(resp?.error || '未知错误');
    message(`已恢复 ${resp.result.restored} 项`);
  } catch (e) { message('撤销失败：' + e.message); }
}

/**
 * onLinkCheck
 * 中文说明：调用后台执行断链检测，并展示结果
 */
async function onLinkCheck() {
  const fid = document.getElementById('toolFolderSelect').value;
  if (!fid) return message('请先选择目标文件夹');
  const enabled = await getLinkCheckEnabled();
  if (!enabled) return message('断链检测功能已在设置中禁用');
  if (!IS_EXT || !chrome.runtime?.sendMessage) return message('预览模式不支持断链检测');
  
  // 获取按钮和进度条元素
  const btn = document.getElementById('btnLinkCheck');
  const bar = document.getElementById('linkCheckProgress');
  const progressFill = bar.querySelector('.progress-fill');
  const progressText = bar.querySelector('.progress-text');
  
  // 设置按钮加载状态
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '检测中...';
  btn.classList.add('loading');
  
  // 显示进度条并重置状态
  bar.classList.remove('hidden');
  if (progressFill) progressFill.style.width = '0%';
  if (progressText) progressText.textContent = '正在初始化检测...';
  
  // 模拟进度更新
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress > 90) progress = 90;
    if (progressFill) progressFill.style.width = progress + '%';
    if (progressText) progressText.textContent = `检测进度：${Math.floor(progress)}%`;
  }, 200);
  
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'LINKCHECK_RUN', payload: { folderId: fid } });
    if (!resp?.ok) throw new Error(resp?.error || '未知错误');
    
    // 清除进度模拟
    clearInterval(progressInterval);
    
    const { summary, items } = resp.data;
    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = `✅ 检测完成：${summary.total} 条`;
    
    renderLinkCheckResult(summary, items);
    
    if (summary.fail > 0) {
      message(`⚠️ 检测完成，发现 ${summary.fail} 个断链`);
    } else {
      message('🎉 检测完成，所有链接正常');
    }
  } catch (e) { 
    clearInterval(progressInterval);
    if (progressFill) progressFill.style.width = '100%';
    if (progressText) progressText.textContent = '❌ 检测失败';
    message('❌ 断链检测失败：' + e.message); 
  } finally { 
    bar.classList.add('hidden');
    // 恢复按钮状态
    btn.disabled = false;
    btn.textContent = originalText;
    btn.classList.remove('loading');
  }
}

/**
 * renderLinkCheckResult
 * 中文说明：将断链检测结果渲染到工具面板
 */
function renderLinkCheckResult(summary, items) {
  const cont = document.getElementById('linkCheckResult');
  const byCat = items.reduce((acc, it) => { (acc[it.category] = acc[it.category] || []).push(it); return acc; }, {});
  cont.innerHTML = `
    <div class="tool-card">
      <h4>检测完成</h4>
      <p>共 ${summary.total} 条 · 正常 ${summary.ok} · 警告 ${summary.warn} · 失败 ${summary.fail} · 超时 ${summary.timeout}</p>
      ${['ok','warn','fail','timeout'].map(cat => `
        <details ${cat==='fail'?'open':''}>
          <summary><span class="badge ${cat}">${cat}</span> ${byCat[cat]?.length || 0} 条</summary>
          ${(byCat[cat] || []).map(it => `<div class="row">${escapeHtml(it.title || '(无标题)')} · <a href="${escapeHtml(it.url)}" target="_blank">${escapeHtml(it.url)}</a></div>`).join('')}
        </details>`).join('')}
    </div>`;
}

/**
 * onSaveSettings
 * 中文说明：保存设置到 storage
 */
async function onSaveSettings() {
  if (!IS_EXT || !chrome.storage?.sync?.set) return message('预览模式不支持保存设置');
  const enableLinkCheck = document.getElementById('enableLinkCheckSetting').checked;
  await chrome.storage.sync.set({ enableLinkCheck });
  message('设置已保存');
  refreshToolButtons();
}

/**
 * getLinkCheckEnabled
 * 中文说明：读取断链检测开关
 */
async function getLinkCheckEnabled() {
  if (!IS_EXT || !chrome.storage?.sync?.get) return true;
  const { enableLinkCheck = true } = await chrome.storage.sync.get(['enableLinkCheck']);
  return !!enableLinkCheck;
}

/**
 * switchPanel
 * 中文说明：切换到指定面板，并高亮对应导航
 */
function switchPanel(panelId) {
  // 隐藏所有面板（移除 active 类）
  ['panelOverview','panelBookmarks','panelSettings'].forEach(id => {
    const panel = document.getElementById(id);
    if (panel) panel.classList.remove('active');
  });
  
  // 显示目标面板（添加 active 类）
  const targetPanel = document.getElementById(panelId);
  if (targetPanel) targetPanel.classList.add('active');
  
  // 高亮对应导航按钮
  ['navOverview','navBookmarks','navSettings'].forEach(id => {
    const nav = document.getElementById(id);
    if (nav) nav.classList.remove('active');
  });
  
  const map = { panelOverview: 'navOverview', panelBookmarks: 'navBookmarks', panelSettings: 'navSettings' };
  const targetNav = document.getElementById(map[panelId]);
  if (targetNav) targetNav.classList.add('active');
}

/**
 * message
 * 中文说明：右下角消息提示
 */
function message(text) {
  const el = document.getElementById('messageArea');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 1800);
}

/**
 * escapeHtml
 * 中文说明：HTML 转义
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 启动 - 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
  init();
});

// 初始化批量操作功能
function initBatchOperations() {
  // 初始化全选复选框
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', onSelectAllBookmarks);
  }
  
  // 初始化批量操作按钮
  const batchMoveBtn = document.getElementById('btnBatchMove');
  const batchUpdateTitleBtn = document.getElementById('btnBatchUpdateTitle');
  const batchDeleteBtn = document.getElementById('btnBatchDelete');
  
  if (batchMoveBtn) {
    batchMoveBtn.addEventListener('click', onBatchMove);
  }
  
  if (batchUpdateTitleBtn) {
    batchUpdateTitleBtn.addEventListener('click', onBatchUpdateTitle);
  }
  
  if (batchDeleteBtn) {
    batchDeleteBtn.addEventListener('click', onBatchDelete);
  }
  
  // 初始化工具区按钮
  const folderSelect = document.getElementById('toolFolderSelect');
  if (folderSelect) {
    folderSelect.addEventListener('change', () => refreshToolButtons());
  }
  
  document.getElementById('btnDedupPreview')?.addEventListener('click', onDedupPreview);
  document.getElementById('btnApplyDedup')?.addEventListener('click', onApplyDedup);
  document.getElementById('btnUndo')?.addEventListener('click', onUndo);
  document.getElementById('btnLinkCheck')?.addEventListener('click', onLinkCheck);
  // 新增：智能整理按钮绑定
  document.getElementById('btnSmartOrganize')?.addEventListener('click', onSmartOrganize);
  
  // 新增：AI整理按钮绑定
  document.getElementById('btnAiOrganizePreview')?.addEventListener('click', onAiOrganizePreview);
  document.getElementById('btnAiOrganizeApply')?.addEventListener('click', onAiOrganizeApply);
  
  // 加载文件夹选项到批量移动下拉框
  loadBatchMoveFolderOptions();
}

// 更新批量操作状态
function updateBatchOperations() {
  const checkboxes = document.querySelectorAll('.bookmark-checkbox');
  const checkedBoxes = document.querySelectorAll('.bookmark-checkbox:checked');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const selectedCount = document.getElementById('selectedCount');
  const batchMoveBtn = document.getElementById('btnBatchMove');
  const batchDeleteBtn = document.getElementById('btnBatchDelete');
  
  // 更新选中计数
  if (selectedCount) {
    selectedCount.textContent = `已选择 ${checkedBoxes.length} 项`;
  }
  
  // 更新全选复选框状态
  if (selectAllCheckbox) {
    if (checkedBoxes.length === 0) {
      selectAllCheckbox.indeterminate = false;
      selectAllCheckbox.checked = false;
    } else if (checkedBoxes.length === checkboxes.length) {
      selectAllCheckbox.indeterminate = false;
      selectAllCheckbox.checked = true;
    } else {
      selectAllCheckbox.indeterminate = true;
    }
  }
  
  // 更新批量操作按钮状态
  const hasSelection = checkedBoxes.length > 0;
  const batchUpdateTitleBtn = document.getElementById('btnBatchUpdateTitle');
  if (batchMoveBtn) batchMoveBtn.disabled = !hasSelection;
  if (batchUpdateTitleBtn) batchUpdateTitleBtn.disabled = !hasSelection;
  if (batchDeleteBtn) batchDeleteBtn.disabled = !hasSelection;
}

// 全选/取消全选
function onSelectAllBookmarks() {
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');
  const checkboxes = document.querySelectorAll('.bookmark-checkbox');
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = selectAllCheckbox.checked;
  });
  
  updateBatchOperations();
}

// 生成文件夹选项HTML
// 中文说明：只显示两级子文件夹，避免选项过多
function generateFolderOptions() {
  if (!g_foldersTree || g_foldersTree.length === 0) {
    return '';
  }
  
  const maxDepth = 2; // 限制最大深度为2级
  
  function buildLimitedOptions(folders, prefix = '', depth = 0) {
    let result = '';
    folders.forEach(folder => {
      result += `<option value="${folder.id}">${escapeHtml(prefix + folder.title)}</option>`;
      // 只有在未达到最大深度时才继续递归
      if (folder.children && folder.children.length > 0 && depth < maxDepth) {
        result += buildLimitedOptions(folder.children, prefix + '  ', depth + 1);
      }
    });
    return result;
  }
  
  return buildLimitedOptions(g_foldersTree);
}

// 加载批量移动的文件夹选项
// 中文说明：只显示两级子文件夹，避免选项过多
function loadBatchMoveFolderOptions() {
  const select = document.getElementById('batchMoveTarget');
  if (!select || !IS_EXT || !chrome.bookmarks?.getTree) return;
  
  chrome.bookmarks.getTree().then(tree => {
    select.innerHTML = '<option value="">选择目标文件夹</option>';
    
    // 递归添加文件夹选项，限制最大深度为2级
    function addFolderOptions(nodes, prefix = '', depth = 0) {
      // 限制最大深度为2级（0级为根，1级为一级子文件夹，2级为二级子文件夹）
      const maxDepth = 2;
      
      nodes.forEach(node => {
        if (!node.url) { // 是文件夹
          const option = document.createElement('option');
          option.value = node.id;
          option.textContent = prefix + (node.title || '(无标题)');
          select.appendChild(option);
          
          // 只有在未达到最大深度时才继续递归
          if (node.children && node.children.length > 0 && depth < maxDepth) {
            addFolderOptions(node.children, prefix + '  ', depth + 1);
          }
        }
      });
    }
    
    addFolderOptions(tree);
  });
}

// 批量移动书签
function onBatchMove() {
  const checkedBoxes = document.querySelectorAll('.bookmark-checkbox:checked');
  const targetFolderId = document.getElementById('batchMoveTarget').value;
  
  if (!targetFolderId) {
    message('请选择目标文件夹');
    return;
  }
  
  if (checkedBoxes.length === 0) {
    message('请选择要移动的书签');
    return;
  }
  
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    message('预览模式不支持移动书签');
    return;
  }
  
  // 读取 data-bookmark-id，修复与渲染不一致问题
  const bookmarkIds = Array.from(checkedBoxes).map(cb => cb.dataset.bookmarkId);
  
  // 设置按钮加载状态
  const batchMoveBtn = document.getElementById('btnBatchMove');
  const originalText = batchMoveBtn.textContent;
  batchMoveBtn.disabled = true;
  batchMoveBtn.textContent = '移动中...';
  batchMoveBtn.classList.add('loading');
  
  // 执行批量移动
  chrome.runtime.sendMessage({
    type: 'BATCH_MOVE_BOOKMARKS',
    payload: {
      bookmarkIds: bookmarkIds,
      targetFolderId: targetFolderId
    }
  }).then(response => {
    try {
      if (response && response.ok) {
        message(`成功移动 ${bookmarkIds.length} 个书签`);
        // 刷新树状视图
        loadAllBookmarks().then(() => {
          renderTree();
        });
        // 清空选择
        document.getElementById('selectAllCheckbox').checked = false;
        document.getElementById('batchMoveTarget').value = '';
        updateBatchOperations();
      } else {
        message(response?.error || '移动失败');
      }
    } finally {
      // 恢复按钮状态
      batchMoveBtn.disabled = false;
      batchMoveBtn.textContent = originalText;
      batchMoveBtn.classList.remove('loading');
    }
  });
}

// 批量删除书签
function onBatchDelete() {
  const checkedBoxes = document.querySelectorAll('.bookmark-checkbox:checked');
  
  if (checkedBoxes.length === 0) {
    message('请选择要删除的书签');
    return;
  }
  
  if (!confirm(`确定要删除选中的 ${checkedBoxes.length} 个书签吗？此操作不可撤销。`)) {
    return;
  }
  
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    message('预览模式不支持删除书签');
    return;
  }
  
  const bookmarkIds = Array.from(checkedBoxes).map(cb => cb.dataset.bookmarkId);
  
  // 设置按钮加载状态
  const batchDeleteBtn = document.getElementById('btnBatchDelete');
  const originalText = batchDeleteBtn.textContent;
  batchDeleteBtn.disabled = true;
  batchDeleteBtn.textContent = '删除中...';
  batchDeleteBtn.classList.add('loading');
  
  // 执行批量删除
  chrome.runtime.sendMessage({
    type: 'BATCH_DELETE_BOOKMARKS',
    payload: {
      bookmarkIds: bookmarkIds
    }
  }).then(response => {
    try {
      if (response && response.ok) {
        message(`成功删除 ${bookmarkIds.length} 个书签`);
        // 刷新树状视图
        loadAllBookmarks().then(() => {
          renderTree();
        });
        // 清空选择
        document.getElementById('selectAllCheckbox').checked = false;
        updateBatchOperations();
      } else {
        message(response?.error || '删除失败');
      }
    } finally {
      // 恢复按钮状态
      batchDeleteBtn.disabled = false;
      batchDeleteBtn.textContent = originalText;
      batchDeleteBtn.classList.remove('loading');
    }
  });
}

/**
 * 批量更新书签标题为最新的网页标题
 * 中文说明：获取选中书签的最新网页标题并批量更新，提供详细的结果反馈
 */
async function onBatchUpdateTitle() {
  const checkedBoxes = document.querySelectorAll('.bookmark-checkbox:checked');
  
  if (checkedBoxes.length === 0) {
    message('请选择要更新标题的书签');
    return;
  }
  
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    message('预览模式不支持更新书签标题');
    return;
  }
  
  const bookmarkIds = Array.from(checkedBoxes).map(cb => cb.dataset.bookmarkId);
  
  // 设置按钮加载状态
  const batchUpdateTitleBtn = document.getElementById('btnBatchUpdateTitle');
  const originalText = batchUpdateTitleBtn.textContent;
  batchUpdateTitleBtn.disabled = true;
  batchUpdateTitleBtn.textContent = '更新中...';
  batchUpdateTitleBtn.classList.add('loading');
  
  try {
    // 获取选中的书签信息
    const selectedBookmarks = g_allBookmarks.filter(bookmark => 
      bookmarkIds.includes(bookmark.id)
    );
    
    // 详细的统计信息
    const stats = {
      total: selectedBookmarks.length,
      success: 0,
      unchanged: 0,
      networkError: 0,
      corsError: 0,
      updateError: 0,
      invalidUrl: 0
    };
    
    const results = [];
    
    // 逐个获取最新标题并更新
    for (let i = 0; i < selectedBookmarks.length; i++) {
      const bookmark = selectedBookmarks[i];
      
      // 更新进度显示
      batchUpdateTitleBtn.textContent = `更新中... (${i + 1}/${selectedBookmarks.length})`;
      
      try {
        // 检查URL有效性
        if (!bookmark.url || !bookmark.url.startsWith('http')) {
          stats.invalidUrl++;
          results.push({
            id: bookmark.id,
            title: bookmark.title,
            status: 'invalid_url',
            reason: 'URL无效或不是HTTP链接'
          });
          continue;
        }
        
        // 获取网页最新标题
        let newTitle;
        try {
          newTitle = await fetchPageTitle(bookmark.url);
        } catch (error) {
          // 根据错误类型分类
          const errorMsg = error.message || String(error);
          
          if (errorMsg.includes('跨域限制') || errorMsg.includes('CORS')) {
            stats.corsError++;
            results.push({
              id: bookmark.id,
              title: bookmark.title,
              status: 'cors_error',
              reason: errorMsg
            });
          } else if (errorMsg.includes('请求超时') || errorMsg.includes('timeout')) {
            stats.networkError++;
            results.push({
              id: bookmark.id,
              title: bookmark.title,
              status: 'timeout_error',
              reason: errorMsg
            });
          } else if (errorMsg.includes('网络错误') || errorMsg.includes('network')) {
            stats.networkError++;
            results.push({
              id: bookmark.id,
              title: bookmark.title,
              status: 'network_error',
              reason: errorMsg
            });
          } else {
            stats.networkError++;
            results.push({
              id: bookmark.id,
              title: bookmark.title,
              status: 'fetch_error',
              reason: errorMsg
            });
          }
          continue;
        }
        
        // 比较标题是否需要更新
        if (newTitle === bookmark.title) {
          stats.unchanged++;
          results.push({
            id: bookmark.id,
            title: bookmark.title,
            status: 'unchanged',
            reason: '标题已是最新'
          });
          continue;
        }
        
        // 更新书签标题
        const response = await chrome.runtime.sendMessage({
          type: 'UPDATE_BOOKMARK_TITLE',
          payload: {
            bookmarkId: bookmark.id,
            newTitle: newTitle
          }
        });
        
        if (response && response.ok) {
          stats.success++;
          results.push({
            id: bookmark.id,
            oldTitle: bookmark.title,
            newTitle: newTitle,
            status: 'success'
          });
        } else {
          stats.updateError++;
          results.push({
            id: bookmark.id,
            title: bookmark.title,
            status: 'update_error',
            error: response?.error || '更新失败'
          });
        }
        
      } catch (error) {
        // 根据错误类型分类
        if (error.message.includes('CORS') || error.message.includes('cors')) {
          stats.corsError++;
          results.push({
            id: bookmark.id,
            title: bookmark.title,
            status: 'cors_error',
            reason: 'CORS跨域限制'
          });
        } else {
          stats.networkError++;
          results.push({
            id: bookmark.id,
            title: bookmark.title,
            status: 'network_error',
            reason: error.message
          });
        }
      }
    }
    
    // 生成详细的结果消息
    let resultMessage = `批量更新标题完成！检查了 ${stats.total} 个书签：`;
    const details = [];
    
    if (stats.success > 0) {
      details.push(`✅ 成功更新：${stats.success} 个`);
    }
    if (stats.unchanged > 0) {
      details.push(`📋 标题未变化：${stats.unchanged} 个`);
    }
    if (stats.networkError > 0) {
      details.push(`🌐 网络相关错误：${stats.networkError} 个`);
    }
    if (stats.corsError > 0) {
      details.push(`🚫 跨域限制：${stats.corsError} 个`);
    }
    if (stats.updateError > 0) {
      details.push(`❌ 更新失败：${stats.updateError} 个`);
    }
    if (stats.invalidUrl > 0) {
      details.push(`🔗 URL无效：${stats.invalidUrl} 个`);
    }
    
    if (details.length > 0) {
      resultMessage += '\n' + details.join('\n');
    }
    
    // 如果没有任何成功更新，提供更详细的说明
    if (stats.success === 0) {
      resultMessage += '\n\n💡 提示：';
      if (stats.corsError > 0) {
        resultMessage += '\n• 跨域限制是正常现象，许多网站不允许跨域访问';
      }
      if (stats.networkError > 0) {
        resultMessage += '\n• 网络错误可能是网站响应慢或无法访问，可以稍后重试';
      }
      if (stats.unchanged > 0) {
        resultMessage += '\n• 标题未变化说明书签标题已经是最新的';
      }
      resultMessage += '\n• 查看浏览器控制台可获取更详细的错误信息';
    }
    
    // 显示结果
    message(resultMessage);
    
    // 如果有成功更新的书签，刷新列表
    if (stats.success > 0) {
      await loadAllBookmarks();
      renderBookmarks();
      if (getCurrentViewMode() === 'tree') {
        renderTree();
      }
    }
    
    // 清空选择
    document.getElementById('selectAllCheckbox').checked = false;
    updateBatchOperations();
    
    // 在控制台输出详细结果供调试
    console.log('批量更新标题详细结果：', { stats, results });
    
  } catch (error) {
    message('批量更新标题失败：' + error.message);
    console.error('批量更新标题错误：', error);
  } finally {
    // 恢复按钮状态
    batchUpdateTitleBtn.disabled = false;
    batchUpdateTitleBtn.textContent = originalText;
    batchUpdateTitleBtn.classList.remove('loading');
  }
}

/**
 * 获取网页标题
 * 中文说明：通过URL获取网页的最新标题，支持超时和重试机制
 * @param {string} url - 网页URL
 * @param {number} timeout - 超时时间（毫秒），默认8000ms
 * @param {number} retries - 重试次数，默认1次
 * @returns {Promise<string|null>} 网页标题或null
 */
async function fetchPageTitle(url, timeout = 8000, retries = 1) {
  // 检查URL有效性
  if (!url || typeof url !== 'string') {
    console.warn('fetchPageTitle: URL无效', url);
    return null;
  }
  
  // 检查是否为特殊协议
  if (url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') || 
      url.startsWith('moz-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('file://')) {
    console.warn('fetchPageTitle: 不支持的协议', url);
    return null;
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 在扩展环境中，使用background script来获取网页标题
      if (IS_EXT && chrome.runtime?.sendMessage) {
        const response = await Promise.race([
          chrome.runtime.sendMessage({
            type: 'FETCH_PAGE_TITLE',
            payload: { url }
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('请求超时')), timeout)
          )
        ]);
        
        if (response && response.ok) {
          const title = response.title;
          // 验证标题有效性
          if (title && typeof title === 'string' && title.trim()) {
            return title.trim();
          }
          return null;
        } else {
          const errorMsg = response?.error || '获取标题失败';
          if (attempt === retries) {
            throw new Error(errorMsg);
          }
          console.warn(`fetchPageTitle 第${attempt + 1}次尝试失败:`, errorMsg);
          continue;
        }
      } else {
        // 预览模式下使用fetch（可能受CORS限制）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const response = await fetch(url, {
            method: 'GET',
            mode: 'cors',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const html = await response.text();
          
          // 解析HTML获取title标签内容
          const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
          if (titleMatch && titleMatch[1]) {
            // 解码HTML实体并清理空白字符
            const title = titleMatch[1]
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            return title || null;
          }
          
          return null;
        } finally {
          clearTimeout(timeoutId);
        }
      }
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const errorMsg = error.message || String(error);
      
      // 记录错误信息
      if (isLastAttempt) {
        console.warn(`fetchPageTitle 最终失败 ${url}:`, errorMsg);
      } else {
        console.warn(`fetchPageTitle 第${attempt + 1}次尝试失败 ${url}:`, errorMsg);
      }
      
      // 如果是最后一次尝试，抛出错误而不是返回null
      if (isLastAttempt) {
        // 根据错误类型提供更具体的错误信息
        if (errorMsg.includes('CORS') || errorMsg.includes('cors') || errorMsg.includes('Cross-Origin')) {
          throw new Error('跨域限制：无法访问该网站');
        } else if (errorMsg.includes('timeout') || errorMsg.includes('aborted') || errorMsg.includes('AbortError')) {
          throw new Error('请求超时：网站响应过慢');
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('NetworkError')) {
          throw new Error('网络错误：无法连接到网站');
        } else if (errorMsg.includes('404')) {
          throw new Error('页面不存在：404错误');
        } else if (errorMsg.includes('403')) {
          throw new Error('访问被拒绝：403错误');
        } else if (errorMsg.includes('500')) {
          throw new Error('服务器错误：500错误');
        } else {
          throw new Error(`获取网页标题失败: ${errorMsg}`);
        }
      }
      
      // 等待一段时间后重试
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  
  // 所有尝试都失败了，抛出最后的错误
  throw new Error('获取网页标题失败：所有重试都已用尽');
}

// 单个书签移动
function onSingleBookmarkMove(selectElement) {
  const bookmarkId = selectElement.dataset.bookmarkId;
  const targetFolderId = selectElement.value;
  
  if (!targetFolderId) return;
  
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    message('预览模式不支持移动书签');
    selectElement.value = '';
    return;
  }
  
  // 设置选择框加载状态
  selectElement.disabled = true;
  
  chrome.runtime.sendMessage({
    type: 'MOVE_BOOKMARK',
    payload: {
      bookmarkId: bookmarkId,
      targetFolderId: targetFolderId
    }
  }).then(response => {
    try {
      if (response && response.ok) {
        message('书签移动成功');
        // 刷新书签列表和树状视图
        loadAllBookmarks().then(() => {
          renderBookmarks(true);
          renderTree();
        });
      } else {
        message(response?.error || '移动失败');
        selectElement.value = ''; // 重置选择
      }
    } finally {
      selectElement.disabled = false;
    }
  });
}

// 单个书签删除
function onSingleBookmarkDelete(bookmarkId) {
  if (!confirm('确定要删除这个书签吗？')) {
    return;
  }
  
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    message('预览模式不支持删除书签');
    return;
  }
  
  chrome.runtime.sendMessage({
    type: 'DELETE_BOOKMARK',
    payload: {
      bookmarkId: bookmarkId
    }
  }).then(response => {
    if (response && response.ok) {
      message('书签删除成功');
      // 刷新书签列表和树状视图
      loadAllBookmarks().then(() => {
        renderBookmarks(true);
        renderTree();
      });
    } else {
      message(response?.error || '删除失败');
    }
  });
}

/**
 * getCurrentViewMode
 * 中文说明：获取当前视图模式（list 或 tree）
 */
function getCurrentViewMode() {
  const listContainer = document.getElementById('listViewContainer');
  const treeContainer = document.getElementById('treeViewContainer');
  
  if (listContainer && !listContainer.classList.contains('hidden')) {
    return 'list';
  } else if (treeContainer && !treeContainer.classList.contains('hidden')) {
    return 'tree';
  }
  return 'list';
}

/**
 * switchViewMode
 * 中文说明：切换列表/树状视图容器显示，并控制分页控件可见性
 */
function switchViewMode(mode) {
  const listContainer = document.getElementById('listViewContainer');
  const treeContainer = document.getElementById('treeViewContainer');
  const paginationContainer = document.getElementById('paginationContainer');
  const btnListView = document.getElementById('btnListView');
  const btnTreeView = document.getElementById('btnTreeView');
  if (mode === 'tree') {
    listContainer?.classList.add('hidden');
    treeContainer?.classList.remove('hidden');
    paginationContainer?.classList.add('hidden');
    btnListView?.classList.remove('active');
    btnTreeView?.classList.add('active');
    if (!treeContainer?.dataset.rendered) {
      renderTree();
      if (treeContainer) treeContainer.dataset.rendered = '1';
    }
  } else {
    treeContainer?.classList.add('hidden');
    listContainer?.classList.remove('hidden');
    paginationContainer?.classList.remove('hidden');
    btnTreeView?.classList.remove('active');
    btnListView?.classList.add('active');
    renderBookmarks();
  }
}

/**
 * renderTree
 * 中文说明：渲染书签树到专用树状容器（懒加载子节点，默认折叠）
 */
function renderTree() {
  const container = document.getElementById('treeViewContainer');
  if (!container) {
    console.warn('treeViewContainer not found');
    return;
  }
  container.innerHTML = '';
  const hint = document.createElement('div');
  hint.className = 'tree-hint';
  hint.textContent = '💡 点击文件夹旁的 ▶ 箭头展开查看子书签';
  container.appendChild(hint);
  if (!IS_EXT || !chrome.bookmarks?.getTree) {
    const demoNode = document.createElement('div');
    demoNode.innerHTML = `<div class="tree-node" data-node-id="demo">
      <div class="node-row"><span class="caret">▶</span><span class="folder">示例文件夹</span></div>
      <div class="children hidden"></div>
    </div>`;
    container.appendChild(demoNode.firstElementChild);
    bindTreeToggles(container);
    return;
  }
  chrome.bookmarks.getTree().then(tree => {
    const frag = document.createDocumentFragment();
    tree.forEach(root => frag.appendChild(renderTreeNode(root)));
    container.appendChild(frag);
    bindTreeToggles(container);
  });
}

/**
 * renderTreeNode
 * 中文说明：递归渲染节点（文件夹/书签），文件夹默认折叠
 */
function renderTreeNode(node) {
  const el = document.createElement('div');
  el.className = 'tree-node';
  el.dataset.nodeId = node.id || '';
  const isFolder = !node.url;
  
  // 优化节点HTML结构，确保叶子节点正确显示
  if (isFolder) {
    // 文件夹节点
    el.innerHTML = `
      <div class="node-row">
        <span class="caret">▶</span>
        <span class="folder" title="${escapeHtml(node.title || '(无标题)')}">${escapeHtml(node.title || '(无标题)')}</span>
      </div>`;
    // 懒加载：创建子节点占位容器
    const childrenC = document.createElement('div');
    childrenC.className = 'children hidden';
    childrenC.dataset.loaded = '0';
    el.appendChild(childrenC);
  } else {
    // 叶子节点（书签）- 优化HTML结构
    el.innerHTML = `
      <div class="node-row">
        <span style="width:16px;display:inline-block;"></span>
        <input type="checkbox" class="bookmark-checkbox" data-bookmark-id="${node.id}">
        <div class="leaf">
          <a href="${escapeHtml(node.url)}" target="_blank" title="${escapeHtml(node.title || '(无标题)')}">${escapeHtml(node.title || '(无标题)')}</a>
        </div>
      </div>`;
  }
  
  return el;
}

/**
 * bindTreeToggles
 * 中文说明：为所有文件夹节点的三角箭头绑定折叠/展开事件
 */
function bindTreeToggles(container) {
  container.querySelectorAll('.caret').forEach(caret => {
    caret.addEventListener('click', async () => {
      const parent = caret.closest('.tree-node');
      const children = parent.querySelector(':scope > .children');
      if (!children) return;
      const collapsed = children.classList.contains('hidden');

      // 若即将展开且未加载过，进行懒加载
      if (collapsed && children.dataset.loaded !== '1') {
        // 预览环境下插入示例子节点；扩展环境调用 chrome.bookmarks.getChildren
        if (!IS_EXT || !chrome.bookmarks?.getChildren) {
          children.innerHTML = `<div class="tree-node"><div class="node-row"><span style="width:12px"></span><input type="checkbox" class="bookmark-checkbox" data-bookmark-id="demo-bookmark"><span class="leaf"><a href="https://example.com" target="_blank">示例链接</a></span></div></div>`;
        } else {
          const nodeId = parent.dataset.nodeId;
          try {
            const kids = await chrome.bookmarks.getChildren(nodeId);
            const frag = document.createDocumentFragment();
            kids.forEach(ch => frag.appendChild(renderTreeNode(ch)));
            children.appendChild(frag);
            // 为新加入的文件夹节点绑定折叠事件
            bindTreeToggles(children);
          } catch (e) {
            console.warn('加载子节点失败', e);
          }
        }
        children.dataset.loaded = '1';
      }

      if (collapsed) {
        children.classList.remove('hidden');
        caret.textContent = '▼';
      } else {
        children.classList.add('hidden');
        // 收起时不重置为未加载，以便二次展开更快；如需节省内存，可在此清空 children 并置 loaded=0
        caret.textContent = '▶';
      }
    });
  });
}

/**
 * refreshToolButtons
 * 中文说明：根据是否选择了工具文件夹，控制工具按钮（含智能整理）的可用状态
 */
async function refreshToolButtons() {
  const folderSelect = document.getElementById('toolFolderSelect');
  const enable = !!(folderSelect && folderSelect.value);
  document.getElementById('btnDedupPreview').disabled = !enable;
  document.getElementById('btnApplyDedup').disabled = !enable;
  document.getElementById('btnLinkCheck').disabled = !enable;
  const smartBtn = document.getElementById('btnSmartOrganize');
  if (smartBtn) smartBtn.disabled = !enable;
  
  // AI整理按钮状态控制
  const aiPreviewBtn = document.getElementById('btnAiOrganizePreview');
  const aiApplyBtn = document.getElementById('btnAiOrganizeApply');
  if (aiPreviewBtn) aiPreviewBtn.disabled = !enable;
  if (aiApplyBtn) aiApplyBtn.disabled = !enable;
  
  document.getElementById('btnUndo').disabled = false; // 可查询后台是否有撤销
}

/**
 * onSmartOrganize
 * 中文说明：根据域名对所选文件夹下的书签进行分类预览并执行移动
 * 策略：
 *  - 遍历选中文件夹下的所有书签，提取 hostname
 *  - 在目标文件夹下为每个 hostname 创建子文件夹（如已存在则复用）
 *  - 生成移动计划，先展示预览，确认后批量移动
 */
async function onSmartOrganize() {
  const folderId = document.getElementById('toolFolderSelect').value;
  if (!folderId) return message('请先选择整理目标文件夹');
  if (!IS_EXT) return message('预览模式不支持智能整理');
  
  // 获取用户选择的分类策略和清理选项
  const strategy = document.getElementById('organizeStrategy').value;
  const cleanEmpty = document.getElementById('cleanEmptyFolders').checked;
  
  // 根据策略提供不同的确认消息
  const strategyNames = {
    domain: '域名',
    topDomain: '顶级域名',
    pathPrefix: '路径前缀',
    keyword: '标题关键词'
  };
  
  const confirmMsg = `将根据${strategyNames[strategy] || '域名'}对选中文件夹内的书签进行分类整理${cleanEmpty ? '，并清理空文件夹' : ''}，是否继续？`;
  
  if (!confirm(confirmMsg)) return;

  // 请求后台执行（后台侧便于创建/查找文件夹并移动，保持一致的撤销行为）
  try {
    const resp = await chrome.runtime.sendMessage({ 
      type: 'SMART_ORGANIZE_BY_DOMAIN', 
      payload: { 
        folderId,
        strategy,
        cleanEmptyFolders: cleanEmpty
      } 
    });
    if (!resp || !resp.ok) {
      return message(resp?.error || '智能整理失败');
    }
    const cleanMsg = resp.cleanedFolders > 0 ? `，清理 ${resp.cleanedFolders} 个空文件夹` : '';
    message(`智能整理完成：移动 ${resp.moved} 项，创建 ${resp.createdFolders} 个文件夹${cleanMsg}`);
    await loadAllBookmarks();
    const mode = getCurrentViewMode();
    if (mode === 'tree') {
      // 重置树容器的rendered标记，强制重新渲染
      const treeContainer = document.getElementById('treeViewContainer');
      if (treeContainer) delete treeContainer.dataset.rendered;
      renderTree();
    } else {
      renderBookmarks(true);
    }
  } catch (e) {
    console.error('智能整理失败', e);
    message('智能整理失败：' + e.message);
  }
}

/**
 * onAiOrganizePreview
 * 中文说明：AI智能整理预览 - 分析书签内容并显示分类建议
 */
async function onAiOrganizePreview() {
  try {
    if (!IS_EXT) return message('预览模式不支持AI整理');
    
    const folderSelect = document.getElementById('toolFolderSelect');
    if (!folderSelect || !folderSelect.value) {
      return message('请先选择要整理的文件夹');
    }
    
    const folderId = folderSelect.value;
    
    // 检查是否在扩展环境中
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return message('预览模式：AI整理功能需要在浏览器扩展环境中使用');
    }
    
    // 从设置中获取AI配置
    const settings = await new Promise(resolve => {
      chrome.storage.sync.get(['aiApiKey', 'aiBatchSize'], resolve);
    });
    
    if (!settings.aiApiKey) {
      return message('请先在设置页面配置SiliconFlow API Key');
    }
    
    // 禁用按钮防止重复点击
    const previewBtn = document.getElementById('btnAiOrganizePreview');
    const applyBtn = document.getElementById('btnAiOrganizeApply');
    const originalPreviewText = previewBtn.textContent;
    const originalApplyText = applyBtn.textContent;
    
    previewBtn.disabled = true;
    applyBtn.disabled = true;
    previewBtn.textContent = '分析中...';
    
    try {
      message('正在分析书签内容，请稍候...');
      console.log('[BookmarkTidy] 发送AI分析请求');
      
      const resp = await chrome.runtime.sendMessage({
        type: 'AI_ORGANIZE_PREVIEW',
        folderId,
        apiKey: settings.aiApiKey,
        batchSize: parseInt(settings.aiBatchSize) || 20
      });
      
      console.log('[BookmarkTidy] 收到AI分析响应:', resp);
      
      if (resp?.error) {
        console.error('[BookmarkTidy] AI分析错误:', resp.error);
        return message(resp.error);
      }
      
      // 显示AI分析结果
       let categories = {};
       if (resp?.data) {
         const data = resp.data;
         categories = data.categories || {};
         const categoryCount = Object.keys(categories).length;
         const bookmarkCount = Object.values(categories).reduce((sum, bookmarks) => sum + bookmarks.length, 0);
         
         message(`AI分析完成：建议创建 ${categoryCount} 个分类，整理 ${bookmarkCount} 个书签`);
         
         // 在控制台显示详细分析结果
         console.log('[AI分析结果]', {
           总书签数: data.totalBookmarks,
           建议分类数: categoryCount,
           分类详情: categories
         });
         
       } else {
         // 兼容旧格式
         categories = resp.categories || {};
         const categoryCount = Object.keys(categories).length;
         const bookmarkCount = Object.values(categories).reduce((sum, bookmarks) => sum + bookmarks.length, 0);
         
         message(`AI分析完成：建议创建 ${categoryCount} 个分类，整理 ${bookmarkCount} 个书签`);
       }
      
    } finally {
      // 恢复按钮状态
      previewBtn.disabled = false;
      applyBtn.disabled = false;
      previewBtn.textContent = originalPreviewText;
    }
    
  } catch (e) {
    console.error('AI分析失败', e);
    message('AI分析失败：' + e.message);
  }
}

/**
 * onAiOrganizeApply
 * 中文说明：执行AI智能整理 - 根据AI分析结果执行书签分类
 */
async function onAiOrganizeApply() {
  try {
    if (!IS_EXT) return message('预览模式不支持AI整理');
    
    const folderSelect = document.getElementById('toolFolderSelect');
    if (!folderSelect || !folderSelect.value) {
      return message('请先选择要整理的文件夹');
    }
    
    const folderId = folderSelect.value;
    
    // 检查是否在扩展环境中
    if (typeof chrome === 'undefined' || !chrome.storage) {
      return message('预览模式：AI整理功能需要在浏览器扩展环境中使用');
    }
    
    // 从设置中获取AI配置
    const settings = await new Promise(resolve => {
      chrome.storage.sync.get(['aiApiKey', 'aiBatchSize', 'aiAutoClean'], resolve);
    });
    
    if (!settings.aiApiKey) {
      return message('请先在设置页面配置SiliconFlow API Key');
    }
    
    // 禁用按钮防止重复点击
    const previewBtn = document.getElementById('btnAiOrganizePreview');
    const applyBtn = document.getElementById('btnAiOrganizeApply');
    const originalPreviewText = previewBtn.textContent;
    const originalApplyText = applyBtn.textContent;
    
    previewBtn.disabled = true;
    applyBtn.disabled = true;
    applyBtn.textContent = '整理中...';
    
    try {
      message('正在执行AI智能整理，请稍候...');
      
      const resp = await chrome.runtime.sendMessage({
        type: 'AI_ORGANIZE_APPLY',
        folderId,
        apiKey: settings.aiApiKey,
        batchSize: parseInt(settings.aiBatchSize) || 20,
        cleanEmptyFolders: settings.aiAutoClean !== false
      });
      
      if (resp?.error) {
        return message(resp.error);
      }
      
      // 处理AI整理结果
       if (resp?.data) {
         const data = resp.data;
         const cleanMsg = data.cleanedEmptyFolders > 0 ? `，清理 ${data.cleanedEmptyFolders} 个空文件夹` : '';
         message(`AI整理完成：移动 ${data.moved} 个书签，创建 ${data.createdFolders} 个分类文件夹${cleanMsg}`);
         
         // 在控制台显示详细执行结果
         console.log('[AI整理结果]', {
           移动书签数: data.moved,
           创建文件夹数: data.createdFolders,
           清理空文件夹数: data.cleanedEmptyFolders || 0
         });
         
       } else {
         // 兼容旧格式
         const cleanMsg = resp.cleanedEmptyFolders > 0 ? `，清理 ${resp.cleanedEmptyFolders} 个空文件夹` : '';
         message(`AI整理完成：移动 ${resp.moved} 个书签，创建 ${resp.createdFolders} 个分类文件夹${cleanMsg}`);
       }
      
      // 刷新界面
      await loadAllBookmarks();
      const mode = getCurrentViewMode();
      if (mode === 'tree') {
        // 重置树容器的rendered标记，强制重新渲染
        const treeContainer = document.getElementById('treeViewContainer');
        if (treeContainer) delete treeContainer.dataset.rendered;
        renderTree();
      } else {
        renderBookmarks(true);
      }
      
    } finally {
      // 恢复按钮状态
      previewBtn.disabled = false;
      applyBtn.disabled = false;
      applyBtn.textContent = originalApplyText;
    }
    
  } catch (e) {
    console.error('AI整理失败', e);
    message('AI整理失败：' + e.message);
  }
}