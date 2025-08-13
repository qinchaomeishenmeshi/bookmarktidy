// popup 逻辑：初始化 UI、拉取文件夹、发消息到后台

let g_enableLinkCheck = true; // 全局缓存开关状态
const IS_EXT = typeof chrome !== 'undefined' && !!chrome.runtime; // 是否运行在扩展环境

/**
 * init
 * 中文说明：弹窗初始化入口，绑定事件、拉取书签文件夹、测试与后台通信
 */
async function init() {
  bindEvents();
  await loadSettings();
  await populateFolders();
  await pingBackground();
  // 新增：如果运行在扩展环境，自动在新标签页打开独立管理页面
  autoOpenManagerIfExt();
}

/**
 * loadSettings
 * 中文说明：读取 options 中保存的配置（如断链检测开关）；静态预览环境给默认值
 */
async function loadSettings() {
  if (!IS_EXT || !chrome.storage?.sync?.get) {
    g_enableLinkCheck = true;
    return;
  }
  const { enableLinkCheck = true } = await chrome.storage.sync.get(['enableLinkCheck']);
  g_enableLinkCheck = !!enableLinkCheck;
}

/**
 * bindEvents
 * 中文说明：绑定按钮点击事件
 */
function bindEvents() {
  document.getElementById('btnScan').addEventListener('click', onScan);
  document.getElementById('btnDedup').addEventListener('click', onDedupPreview);
  document.getElementById('btnLinkCheck').addEventListener('click', onLinkCheck);

  // 根据选择状态刷新按钮可用性
  const folderSelect = document.getElementById('folderSelect');
  const refresh = () => {
    const hasValue = !!folderSelect.value;
    document.getElementById('btnScan').disabled = !hasValue;
    document.getElementById('btnDedup').disabled = !hasValue;
    document.getElementById('btnLinkCheck').disabled = !hasValue || !g_enableLinkCheck;
    document.getElementById('btnLinkCheck').title = g_enableLinkCheck ? '' : '在设置中启用断链检测后可用';
  };
  folderSelect.addEventListener('change', refresh);
  // 初次刷新
  refresh();
}

/**
 * renderResultHtml
 * 中文说明：将生成的 HTML 片段渲染到结果区域并展示
 */
function renderResultHtml(html) {
  const result = document.getElementById('result');
  result.classList.remove('hidden');
  result.innerHTML = html;
}

/**
 * onScan
 * 中文说明：扫描按钮点击处理，激活去重和断链检测按钮
 */
function onScan() {
  const folderSelect = document.getElementById('folderSelect');
  if (!folderSelect.value) {
    showMessage('请先选择书签文件夹');
    return;
  }
  
  // 激活功能按钮
  document.getElementById('btnDedup').disabled = false;
  document.getElementById('btnLinkCheck').disabled = !g_enableLinkCheck;
  
  showMessage('已选择文件夹，可使用去重和断链检测功能');
}

/**
 * onLinkCheck
 * 中文说明：断链检测按钮点击处理，显示进度并将结果分类展示
 */
async function onLinkCheck() {
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    showMessage('预览模式不支持断链检测，请在 Chrome 中"加载已解压的扩展程序"后使用');
    return;
  }

  const folderId = document.getElementById('folderSelect').value;
  if (!folderId) {
    showMessage('请先选择书签文件夹');
    return;
  }

  if (!g_enableLinkCheck) {
    showMessage('断链检测功能已在设置中禁用，请先到设置页面启用此功能');
    return;
  }

  showMessage('正在进行断链检测，请稍候...');
  const startTime = Date.now();

  try {
    const resp = await chrome.runtime.sendMessage({ 
      type: 'LINKCHECK_RUN', 
      payload: { folderId } 
    });
    
    if (!resp?.ok) throw new Error(resp?.error || '断链检测失败');

    const { summary, items } = resp.data;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    renderLinkCheckResult(summary, items, duration);
  } catch (e) {
    console.error('断链检测错误', e);
    showMessage(`断链检测失败：${e.message}`);
  }
}

/**
 * populateFolders
 * 中文说明：读取书签树，填充文件夹下拉列表，包含空文件夹；在非扩展环境下展示占位项
 */
async function populateFolders() {
  const select = document.getElementById('folderSelect');
  select.innerHTML = '<option value="">加载中...</option>';

  try {
    if (!IS_EXT || !chrome.bookmarks?.getTree) {
      // 静态预览占位
      select.innerHTML = '<option value="demo">[预览模式] 示例文件夹</option>';
      return;
    }

    const tree = await chrome.bookmarks.getTree();
    const folders = [];

    // 深度优先遍历，收集文件夹（无 url 的节点）
    const stack = [...(tree || [])];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (!node.url) {
        // 无 url 视作文件夹（即使 children 为空也纳入）
        folders.push(node);
      }
      if (node.children && node.children.length > 0) {
        for (const child of node.children) stack.push(child);
      }
    }

    // 填充列表
    select.innerHTML = '<option value="">请选择文件夹</option>' +
      folders.map(f => `<option value="${f.id}">${escapeHtml(f.title || '(无标题)')}</option>`).join('');
  } catch (e) {
    console.error('读取书签失败', e);
    showMessage('读取书签失败，请查看控制台');
  }
}

/**
 * onDedupPreview
 * 中文说明：请求后台生成去重预览，将重复组以可勾选列表展示；在预览环境显示提示
 */
async function onDedupPreview() {
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    showMessage('预览模式不支持去重，请在 Chrome 中“加载已解压的扩展程序”后使用');
    return;
  }

  const folderId = document.getElementById('folderSelect').value;
  if (!folderId) return;
  showMessage('正在生成去重预览...');

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'DEDUP_PREVIEW', payload: { folderId } });
    if (!resp?.ok) throw new Error(resp?.error || '未知错误');

    const groups = resp.data.groups || [];
    if (!groups.length) {
      renderResultHtml('<p>未发现重复书签。</p>');
      return;
    }

    // 构建 UI：每个组一块，默认保留项禁用勾选
    const html = [
      '<div class="card"><div class="row"><button id="applyDedup">确认删除勾选项</button><button id="undoAction">撤销上次操作</button></div></div>'
    ];

    groups.forEach((g, gi) => {
      html.push(`<div class="card"><h4>重复组 #${gi + 1} · ${escapeHtml(g.normalizedUrl)}</h4>`);
      g.items.forEach(item => {
        html.push(
          `<label class="row"><input type="checkbox" data-id="${item.id}" ${item.keep ? 'disabled' : ''} />` +
          `<span title="${escapeHtml(item.url)}">${item.keep ? '保留' : '删除'}</span> · ${escapeHtml(item.title || '(无标题)')}</label>`
        );
      });
      html.push('</div>');
    });

    renderResultHtml(html.join(''));

    // 绑定操作按钮事件
    document.getElementById('applyDedup').addEventListener('click', () => applyDedup(groups));
    document.getElementById('undoAction').addEventListener('click', onUndo);
  } catch (e) {
    console.error(e);
    showMessage('生成预览失败：' + e.message);
  }
}

/**
 * applyDedup
 * 中文说明：读取用户勾选项，调用后台执行删除
 */
async function applyDedup(groups) {
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    showMessage('预览模式不支持删除');
    return;
  }

  const checkedIds = Array.from(document.querySelectorAll('#result input[type="checkbox"]:checked'))
    .map(el => el.getAttribute('data-id'));

  const toDelete = [];
  groups.forEach(g => {
    g.items.forEach(item => {
      if (checkedIds.includes(String(item.id))) {
        toDelete.push(item);
      }
    });
  });

  if (!toDelete.length) {
    showMessage('未选择待删除项');
    return;
  }

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'DEDUP_APPLY', payload: { toDeleteItems: toDelete } });
    if (!resp?.ok) throw new Error(resp?.error || '未知错误');
    showMessage(`已删除 ${resp.result.deleted} 项，可点击“撤销上次操作”恢复`);
  } catch (e) {
    console.error(e);
    showMessage('删除失败：' + e.message);
  }
}

/**
 * onUndo
 * 中文说明：调用后台撤销上一次删除操作
 */
async function onUndo() {
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    showMessage('预览模式不支持撤销');
    return;
  }
  try {
    const has = await chrome.runtime.sendMessage({ type: 'HAS_UNDO' });
    if (!has?.ok || !has?.data?.has) {
      showMessage('没有可撤销的操作');
      return;
    }
    const resp = await chrome.runtime.sendMessage({ type: 'UNDO_LAST_ACTION' });
    if (!resp?.ok) throw new Error(resp?.error || '未知错误');
    showMessage(`已恢复 ${resp.result.restored} 项`);
  } catch (e) {
    console.error(e);
    showMessage('撤销失败：' + e.message);
  }
}

/**
 * pingBackground
 * 中文说明：测试与 background 的通信；在预览模式仅输出提示
 */
async function pingBackground() {
  if (!IS_EXT || !chrome.runtime?.sendMessage) {
    console.log('[预览] 跳过与 background 通信测试');
    return;
  }
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'PING' });
    console.log('PING 响应：', resp);
  } catch (e) {
    console.warn('与 background 通信失败（这在静态预览中是正常的）', e);
  }
}

/**
 * renderResultHtml
 * 中文说明：将生成的 HTML 片段渲染到结果区域
 */
function renderResultHtml(html) {
  const result = document.getElementById('result');
  result.innerHTML = html;
}

/**
 * showMessage
 * 中文说明：简单的消息展示到结果区域，确保结果区域可见
 */
function showMessage(msg) {
  const result = document.getElementById('result');
  result.classList.remove('hidden');
  result.innerHTML = `<div class="card">${escapeHtml(String(msg))}</div>`;
}

/**
 * escapeHtml
 * 中文说明：转义 HTML，避免 XSS
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * renderLinkCheckResult
 * 中文说明：渲染断链检测结果，按类别分组展示，并显示汇总与耗时
 * @param {{total:number, ok:number, warn:number, fail:number, timeout:number}} summary
 * @param {Array<{id:string,title:string,url:string,status:number,category:string,ok:boolean,error?:string}>} items
 * @param {string|number} durationSec
 */
function renderLinkCheckResult(summary, items, durationSec) {
  const byCat = items.reduce((acc, it) => {
    (acc[it.category] = acc[it.category] || []).push(it);
    return acc;
  }, {});

  const sec = typeof durationSec === 'number' ? durationSec.toFixed(1) : durationSec;
  const header = `
    <div class="card">
      <h3>断链检测完成</h3>
      <p>共 ${summary.total} 条链接 · 正常 ${summary.ok} · 警告 ${summary.warn} · 失败 ${summary.fail} · 超时 ${summary.timeout} · 耗时 ${sec}s</p>
      <div class="row" style="gap: 8px; flex-wrap: wrap;">
        <button data-filter="all">全部</button>
        <button data-filter="ok">正常(${summary.ok})</button>
        <button data-filter="warn">警告(${summary.warn})</button>
        <button data-filter="fail">失败(${summary.fail})</button>
        <button data-filter="timeout">超时(${summary.timeout})</button>
      </div>
    </div>
  `;

  const renderList = (list) => {
    if (!list.length) return '<div class="card"><p>无数据</p></div>';
    const rows = list.map(it => `
      <div class="row" style="align-items:flex-start; gap:10px;">
        <span class="badge ${it.category}">${it.category.toUpperCase()}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;">${escapeHtml(it.title || '(无标题)')}</div>
          <div style="font-size:12px; color:#666; word-break: break-all;">${escapeHtml(it.url || '')}</div>
        </div>
        <div style="width:80px; text-align:right; font-size:12px; color:#999;">${it.status || ''}</div>
      </div>
    `).join('');
    return `<div class="card">${rows}</div>`;
  };

  // 首次渲染全部
  renderResultHtml(header + renderList(items));

  // 绑定过滤事件到实际 DOM
  const bindFilters = () => {
    const buttons = document.querySelectorAll('#result button[data-filter]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-filter');
        let list = items;
        if (cat !== 'all') list = byCat[cat] || [];
        renderResultHtml(header + renderList(list));
        // 重新绑定（因为 DOM 被替换了）
        bindFilters();
      });
    });
  };
  bindFilters();
}

// 启动
init();

/**
 * autoOpenManagerIfExt
 * 中文说明：在扩展环境下，从弹窗自动打开独立管理页面，并关闭当前弹窗；
 * 预览环境不触发，避免影响静态预览。
 */
function autoOpenManagerIfExt() {
  try {
    if (!IS_EXT || !chrome.runtime?.getURL || !chrome.tabs?.create) return;
    const url = chrome.runtime.getURL('manager.html');
    chrome.tabs.create({ url });
    // 关闭弹窗，聚焦到新标签页
    window.close();
  } catch (e) {
    console.warn('自动打开管理页面失败', e);
  }
}