// 背景脚本（Service Worker）：作为任务中枢与消息路由
// 说明：此文件内的函数将添加中文注释，便于阅读与维护

// 引入工具脚本（MV3 Service Worker 支持 importScripts）
try { 
  importScripts('utils/urlNormalizer.js'); 
  console.log('[BookmarkTidy] urlNormalizer.js 加载成功');
} catch (e) { 
  console.warn('无法加载 urlNormalizer 工具', e); 
}

try { 
  importScripts('ai-organizer.js'); 
  console.log('[BookmarkTidy] ai-organizer.js 加载成功');
  // 检查关键函数是否已定义
  if (typeof aiSmartOrganize === 'function') {
    console.log('[BookmarkTidy] aiSmartOrganize 函数已定义');
    // 确保函数在全局作用域中可用
    self.aiSmartOrganize = aiSmartOrganize;
  } else {
    console.error('[BookmarkTidy] aiSmartOrganize 函数未定义');
    // 尝试重新加载模块
    importScripts('ai-organizer.js');
  }
} catch (e) { 
  console.error('[BookmarkTidy] 无法加载 AI整理器模块', e); 
  // 尝试第二次加载
  try {
    importScripts('ai-organizer.js');
    console.log('[BookmarkTidy] 第二次尝试加载 ai-organizer.js 成功');
    if (typeof aiSmartOrganize === 'function') {
      self.aiSmartOrganize = aiSmartOrganize;
    }
  } catch (e2) {
    console.error('[BookmarkTidy] 第二次尝试加载 AI整理器模块失败', e2);
  }
}

// 全局状态：用于一次性撤销
let lastAction = null;

// 安装或更新时触发，做一次初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[BookmarkTidy] 扩展已安装或更新');
});

// 简单的消息路由表，后续功能在此注册
defaultHandlers();

/**
 * defaultHandlers
 * 中文说明：注册默认消息处理器，提供心跳与去重相关的通信处理
 */
function defaultHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'PING': {
        // 心跳测试：用于验证 popup 与后台通信
        // 返回扩展版本与时间戳
        sendResponse({ ok: true, version: chrome.runtime.getManifest().version, ts: Date.now() });
        break;
      }

      case 'DEDUP_PREVIEW': {
        // 去重预览：输入为选择的文件夹 ID
        // 返回重复分组与默认保留/删除建议
        const { folderId } = message.payload || {};
        dedupPreview(folderId)
          .then(data => sendResponse({ ok: true, data }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'DEDUP_APPLY': {
        // 应用去重：删除被勾选的书签，同时记录撤销信息
        const { toDeleteItems } = message.payload || {};
        applyDedupDeletion(toDeleteItems)
          .then(result => sendResponse({ ok: true, result }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'UNDO_LAST_ACTION': {
        // 撤销上一次破坏性操作（仅一次）
        undoLastAction()
          .then(result => sendResponse({ ok: true, result }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'HAS_UNDO': {
        // 统一返回结构，便于前端处理
        sendResponse({ ok: true, data: { has: !!lastAction } });
         break;
       }

      case 'LINKCHECK_RUN': {
        // 断链检测：对指定文件夹下的书签进行批量可访问性检测
        const { folderId } = message.payload || {};
        runLinkCheck(folderId)
          .then(data => sendResponse({ ok: true, data }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'BATCH_MOVE_BOOKMARKS': {
        // 批量移动书签
        const { bookmarkIds, targetFolderId } = message.payload || {};
        batchMoveBookmarks(bookmarkIds, targetFolderId)
          .then(result => sendResponse({ ok: true, result }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'BATCH_DELETE_BOOKMARKS': {
        // 批量删除书签
        const { bookmarkIds } = message.payload || {};
        batchDeleteBookmarks(bookmarkIds)
          .then(result => sendResponse({ ok: true, result }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'MOVE_BOOKMARK': {
        // 移动单个书签
        const { bookmarkId, targetFolderId } = message.payload || {};
        moveBookmark(bookmarkId, targetFolderId)
          .then(result => sendResponse({ ok: true, result }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'DELETE_BOOKMARK': {
        // 删除单个书签
        const { bookmarkId } = message.payload || {};
        deleteBookmark(bookmarkId)
          .then(result => sendResponse({ ok: true, result }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'UPDATE_BOOKMARK_TITLE': {
        // 更新书签标题
        const { bookmarkId, newTitle } = message.payload || {};
        updateBookmarkTitle(bookmarkId, newTitle)
          .then(result => sendResponse({ ok: true, result }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'FETCH_PAGE_TITLE': {
        // 获取网页标题
        const { url } = message.payload || {};
        fetchPageTitle(url)
          .then(result => sendResponse({ ok: true, title: result.title }))
          .catch(err => sendResponse({ ok: false, error: err.message }));
        return true;
      }

      case 'SMART_ORGANIZE_BY_DOMAIN': {
        // 智能整理：根据策略将选中文件夹下的书签归类到同级子文件夹
        const { folderId, strategy = 'domain', cleanEmptyFolders = false } = message.payload || {};
        smartOrganize(folderId, { strategy, cleanEmptyFolders })
          .then(res => sendResponse({ ok: true, ...res }))
          .catch(err => sendResponse({ ok: false, error: String(err) }));
        return true;
      }

      case 'AI_ORGANIZE_PREVIEW': {
        // AI智能整理预览：分析书签内容并返回分类建议
        const { folderId, apiKey, batchSize } = message;
        console.log('[BookmarkTidy] AI分析请求:', { folderId, batchSize }); // 添加日志
        if (!folderId) {
          sendResponse({ ok: false, error: '文件夹ID不能为空' });
          return true;
        }
        
        // 确保AI整理模块已加载
        try {
          // 如果模块未加载，尝试重新加载
          if (typeof aiSmartOrganize !== 'function' && typeof self.aiSmartOrganize !== 'function') {
            console.log('[BookmarkTidy] 尝试重新加载AI整理模块');
            importScripts('ai-organizer.js');
          }
          
          // 检查函数是否已定义
          console.log('[BookmarkTidy] 检查aiSmartOrganize函数:', typeof aiSmartOrganize);
          console.log('[BookmarkTidy] self对象中的aiSmartOrganize:', typeof self.aiSmartOrganize);
          
          // 确定要使用的函数
          let organizeFunc = null;
          if (typeof aiSmartOrganize === 'function') {
            organizeFunc = aiSmartOrganize;
            console.log('[BookmarkTidy] 使用全局aiSmartOrganize函数');
          } else if (typeof self.aiSmartOrganize === 'function') {
            organizeFunc = self.aiSmartOrganize;
            console.log('[BookmarkTidy] 使用self.aiSmartOrganize函数');
          }
          
          if (organizeFunc) {
            // 使用正确的函数引用
            organizeFunc(folderId, { apiKey, batchSize, dryRun: true })
              .then(result => {
                console.log('[BookmarkTidy] AI分析完成:', result); // 添加日志
                sendResponse({ ok: true, data: result })
              })
              .catch(err => {
                console.error('[BookmarkTidy] AI分析失败:', err); // 添加错误日志
                sendResponse({ ok: false, error: String(err) })
              });
          } else {
            console.error('[BookmarkTidy] AI整理模块未能正确加载');
            sendResponse({ ok: false, error: 'AI整理模块未能正确加载，请刷新页面重试' });
          }
        } catch (e) {
          console.error('[BookmarkTidy] 处理AI分析请求时出错:', e);
          sendResponse({ ok: false, error: '处理请求时出错: ' + String(e) });
        }
        return true;
      }

      case 'AI_ORGANIZE_APPLY': {
        // AI智能整理执行：根据AI分析结果执行书签分类
        const { folderId, apiKey, batchSize, cleanEmptyFolders = false } = message;
        console.log('[BookmarkTidy] AI整理请求:', { folderId, batchSize, cleanEmptyFolders }); // 添加日志
        if (!folderId) {
          sendResponse({ ok: false, error: '文件夹ID不能为空' });
          return true;
        }
        
        // 确保AI整理模块已加载
        try {
          // 如果模块未加载，尝试重新加载
          if (typeof aiSmartOrganize !== 'function' && typeof self.aiSmartOrganize !== 'function') {
            console.log('[BookmarkTidy] 尝试重新加载AI整理模块');
            importScripts('ai-organizer.js');
          }
          
          // 检查函数是否已定义
          console.log('[BookmarkTidy] 检查aiSmartOrganize函数:', typeof aiSmartOrganize);
          console.log('[BookmarkTidy] self对象中的aiSmartOrganize:', typeof self.aiSmartOrganize);
          
          // 确定要使用的函数
          let organizeFunc = null;
          if (typeof aiSmartOrganize === 'function') {
            organizeFunc = aiSmartOrganize;
            console.log('[BookmarkTidy] 使用全局aiSmartOrganize函数');
          } else if (typeof self.aiSmartOrganize === 'function') {
            organizeFunc = self.aiSmartOrganize;
            console.log('[BookmarkTidy] 使用self.aiSmartOrganize函数');
          }
          
          if (organizeFunc) {
            // 使用正确的函数引用
            organizeFunc(folderId, { apiKey, batchSize, cleanEmptyFolders, dryRun: false })
              .then(result => {
                console.log('[BookmarkTidy] AI整理完成:', result); // 添加日志
                sendResponse({ ok: true, data: result })
            })
              .catch(err => {
                console.error('[BookmarkTidy] AI整理失败:', err); // 添加错误日志
                sendResponse({ ok: false, error: String(err) })
              });
          } else {
            console.error('[BookmarkTidy] AI整理模块未能正确加载');
            sendResponse({ ok: false, error: 'AI整理模块未能正确加载，请刷新页面重试' });
          }
        } catch (e) {
          console.error('[BookmarkTidy] 处理AI整理请求时出错:', e);
          sendResponse({ ok: false, error: '处理请求时出错: ' + String(e) });
        }
        return true;
      }

       default:
        // 未知消息类型
        sendResponse({ ok: false, error: 'Unknown message type' });
    }

    // 告诉 Chrome 我们会同步/立即响应
    return true;
  });
}

/**
 * dedupPreview
 * 中文说明：获取指定文件夹下的所有书签（递归），按规范化 URL 分组，生成去重预览数据
 * 默认保留“最早收藏”的一条，其他标记为待删除
 * @param {string} folderId 书签文件夹ID
 * @returns {Promise<{groups: Array}>}
 */
async function dedupPreview(folderId) {
  if (!folderId) throw new Error('folderId 不能为空');
  const bookmarks = await getBookmarksUnderFolder(folderId);
  const groupsMap = generateDuplicateGroups(bookmarks, {});

  const groups = [];
  for (const [normUrl, items] of groupsMap.entries()) {
    // 找到最早收藏的一个作为保留项
    const sorted = [...items].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
    const keepId = sorted[0]?.id;
    const group = {
      normalizedUrl: normUrl,
      items: items.map(it => ({
        id: it.id,
        title: it.title || '',
        url: it.url || '',
        dateAdded: it.dateAdded || 0,
        parentId: it.parentId,
        index: it.index,
        keep: it.id === keepId
      }))
    };
    groups.push(group);
  }

  // 按组内元素数量排序（多的在前），方便用户优先处理
  groups.sort((a, b) => b.items.length - a.items.length);
  return { groups };
}

/**
 * getBookmarksUnderFolder
 * 中文说明：递归获取指定文件夹下的所有“书签”节点（不含文件夹节点）
 * @param {string} folderId 书签文件夹ID
 * @returns {Promise<Array>} 书签节点数组
 */
async function getBookmarksUnderFolder(folderId) {
  const subTree = await chrome.bookmarks.getSubTree(folderId);
  const result = [];

  /** 深度优先遍历节点树 */
  function dfs(node) {
    if (!node) return;
    if (node.url) {
      result.push(node);
    }
    if (node.children && node.children.length) {
      for (const child of node.children) dfs(child);
    }
  }

  for (const root of subTree) dfs(root);
  return result;
}

/**
 * applyDedupDeletion
 * 中文说明：根据前端勾选的节点进行批量删除，并记录撤销信息（仅支持一次撤销）
 * @param {Array<{id:string,title:string,url:string,parentId:string,index:number}>} toDeleteItems 待删除项
 * @returns {Promise<{deleted:number}>}
 */
async function applyDedupDeletion(toDeleteItems) {
  if (!Array.isArray(toDeleteItems) || toDeleteItems.length === 0) {
    return { deleted: 0 };
  }

  // 记录撤销所需的信息
  lastAction = {
    type: 'DEDUP_DELETE',
    ts: Date.now(),
    items: toDeleteItems.map(x => ({ id: x.id, title: x.title, url: x.url, parentId: x.parentId, index: x.index }))
  };

  // 批量删除
  let deleted = 0;
  for (const item of toDeleteItems) {
    try {
      await chrome.bookmarks.remove(item.id);
      deleted += 1;
    } catch (e) {
      console.warn('删除失败', item, e);
    }
  }

  return { deleted };
}

/**
 * undoLastAction
 * 中文说明：撤销最近一次“去重删除”操作，将书签按原父节点与索引恢复
 * 注意：恢复后的书签会生成新ID，无法与旧ID完全一致
 * @returns {Promise<{restored:number}>}
 */
async function undoLastAction() {
  if (!lastAction) {
    return { restored: 0, message: '没有可撤销的操作' };
  }

  let restored = 0;
  let message = '';

  try {
    switch (lastAction.type) {
      case 'DEDUP_DELETE':
      case 'BATCH_DELETE':
      case 'DELETE': {
        // 恢复删除的书签
        const items = lastAction.type === 'DELETE' ? [lastAction.data] : 
                     lastAction.type === 'DEDUP_DELETE' ? lastAction.items : lastAction.data;
        
        for (const item of items) {
          try {
            await chrome.bookmarks.create({
              parentId: item.parentId,
              index: item.index,
              title: item.title,
              url: item.url
            });
            restored += 1;
          } catch (e) {
            console.warn('恢复书签失败', item, e);
          }
        }
        message = `成功恢复 ${restored} 个书签`;
        break;
      }

      case 'BATCH_MOVE':
      case 'MOVE':
      case 'AI_ORGANIZE': {
        // 恢复移动的书签到原位置
        const items = lastAction.type === 'MOVE' ? [lastAction.data] : lastAction.data;
        
        // 先恢复书签位置
        for (const item of items) {
          try {
            await chrome.bookmarks.move(item.id, {
              parentId: item.originalParentId,
              index: item.originalIndex
            });
            restored += 1;
          } catch (e) {
            console.warn('恢复书签位置失败', item, e);
          }
        }

        // 删除智能整理时新建的空文件夹（如果有）
        let deletedFolders = 0;
        if (lastAction.createdFolderIds && Array.isArray(lastAction.createdFolderIds)) {
          for (const folderId of lastAction.createdFolderIds) {
            try {
              // 检查文件夹是否为空，避免误删有内容的文件夹
              const children = await chrome.bookmarks.getChildren(folderId);
              if (!children || children.length === 0) {
                await chrome.bookmarks.removeTree(folderId);
                deletedFolders += 1;
              }
            } catch (e) {
              console.warn('删除空文件夹失败', folderId, e);
            }
          }
        }

        // 重建被清理的空文件夹（如果有）
        let recreatedFolders = 0;
        if (lastAction.cleanedEmptyFolders && Array.isArray(lastAction.cleanedEmptyFolders)) {
          for (const f of lastAction.cleanedEmptyFolders) {
            try {
              await chrome.bookmarks.create({ parentId: f.parentId, index: f.index ?? 0, title: f.title });
              recreatedFolders += 1;
            } catch (e) {
              console.warn('重建被清理的空文件夹失败', f, e);
            }
          }
        }

        message = `成功恢复 ${restored} 个书签的位置`;
        if (deletedFolders > 0) {
          message += `，清理 ${deletedFolders} 个新建的空文件夹`;
        }
        if (recreatedFolders > 0) {
          message += `，重建 ${recreatedFolders} 个被清理的空文件夹`;
        }
        break;
      }

      case 'UPDATE_TITLE': {
        // 恢复书签标题
        const { id, oldTitle } = lastAction.data;
        try {
          await chrome.bookmarks.update(id, { title: oldTitle });
          restored = 1;
          message = `成功恢复书签标题："${oldTitle}"`;
        } catch (e) {
          console.warn('恢复书签标题失败', lastAction.data, e);
          message = `恢复书签标题失败: ${e.message}`;
        }
        break;
      }

      default:
        return { restored: 0, message: '不支持的撤销操作类型' };
    }
  } catch (error) {
    console.error('撤销操作失败', error);
    return { restored, message: `撤销失败: ${error.message}` };
  }

  // 仅支持一次撤销，完成后清空
  lastAction = null;
  return { restored, message };
}

/**
 * runLinkCheck
 * 中文说明：对选中文件夹下的书签批量进行可访问性检测
 * 策略：优先 HEAD，不支持时回退 GET；并发限制与超时控制；分类统计
 * @param {string} folderId 书签文件夹ID
 * @returns {Promise<{summary: {total:number, ok:number, warn:number, fail:number, timeout:number}, items: Array}>}
 */
async function runLinkCheck(folderId) {
  if (!folderId) throw new Error('folderId 不能为空');

  const bookmarks = await getBookmarksUnderFolder(folderId);
  const targets = bookmarks.map(b => ({ id: b.id, title: b.title || '', url: b.url || '', parentId: b.parentId, index: b.index }));

  // 并发与超时策略
  const CONCURRENCY = 12; // 并发上限
  const TIMEOUT_MS = 8000; // 单链接超时

  const results = [];

  /**
   * fetchWithTimeout
   * 中文说明：封装带超时的 fetch（HEAD 优先，失败回退 GET）
   */
  const fetchWithTimeout = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal, mode: 'no-cors' });
      // mode: 'no-cors' 时不可读状态码，若可读则继续判断；否则尝试 GET 取可见状态
      if (!res || typeof res.status !== 'number' || res.type === 'opaque') {
        res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  };

  /**
   * classify
   * 中文说明：根据状态码分类：2xx/3xx → ok；4xx → fail；5xx → warn（服务器错误）；网络异常 → fail；超时 → timeout
   */
  const classify = (res, err) => {
    if (err && err.name === 'AbortError') return 'timeout';
    if (err) return 'fail';
    const status = res?.status || 0;
    if (status >= 200 && status < 400) return 'ok';
    if (status >= 500) return 'warn';
    if (status >= 400) return 'fail';
    // 未知或不可读状态（opaque），保守视为 ok
    return 'ok';
  };

  // 批次并发处理：每次处理 CONCURRENCY 个链接
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (current) => {
      let response; let error = null;
      try {
        response = await fetchWithTimeout(current.url);
      } catch (e) {
        error = e;
      }
      const category = classify(response, error);
      return { 
        ...current, 
        status: response?.status || 0, 
        ok: category === 'ok', 
        category, 
        error: error ? String(error) : '' 
      };
    });
    
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  const summary = {
    total: results.length,
    ok: results.filter(x => x.category === 'ok').length,
    warn: results.filter(x => x.category === 'warn').length,
    fail: results.filter(x => x.category === 'fail').length,
    timeout: results.filter(x => x.category === 'timeout').length,
  };

  return { summary, items: results };
}

/**
 * batchMoveBookmarks
 * 中文说明：批量移动书签到指定文件夹
 * @param {string[]} bookmarkIds 要移动的书签ID数组
 * @param {string} targetFolderId 目标文件夹ID
 * @returns {Promise<Object>} 移动结果
 */
async function batchMoveBookmarks(bookmarkIds, targetFolderId) {
  if (!bookmarkIds || !Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
    throw new Error('书签ID列表不能为空');
  }
  
  if (!targetFolderId) {
    throw new Error('目标文件夹ID不能为空');
  }
  
  let successCount = 0;
  let failedCount = 0;
  const errors = [];
  
  // 记录移动前的位置，用于撤销
  const moveHistory = [];
  
  for (const bookmarkId of bookmarkIds) {
    try {
      // 获取书签当前信息
      const [bookmark] = await chrome.bookmarks.get(bookmarkId);
      moveHistory.push({
        id: bookmarkId,
        originalParentId: bookmark.parentId,
        originalIndex: bookmark.index
      });
      
      // 移动书签
      await chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId });
      successCount++;
    } catch (error) {
      failedCount++;
      errors.push(`书签 ${bookmarkId}: ${error.message}`);
    }
  }
  
  // 记录撤销信息
  if (successCount > 0) {
    lastAction = {
      type: 'BATCH_MOVE',
      timestamp: Date.now(),
      data: moveHistory.filter((_, index) => index < successCount)
    };
  }
  
  return {
    successCount,
    failedCount,
    total: bookmarkIds.length,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * batchDeleteBookmarks
 * 中文说明：批量删除书签
 * @param {string[]} bookmarkIds 要删除的书签ID数组
 * @returns {Promise<Object>} 删除结果
 */
async function batchDeleteBookmarks(bookmarkIds) {
  if (!bookmarkIds || !Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
    throw new Error('书签ID列表不能为空');
  }
  
  let successCount = 0;
  let failedCount = 0;
  const errors = [];
  const deletedBookmarks = [];
  
  for (const bookmarkId of bookmarkIds) {
    try {
      // 获取书签信息用于撤销
      const [bookmark] = await chrome.bookmarks.get(bookmarkId);
      deletedBookmarks.push({
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index
      });
      
      // 删除书签
      await chrome.bookmarks.remove(bookmarkId);
      successCount++;
    } catch (error) {
      failedCount++;
      errors.push(`书签 ${bookmarkId}: ${error.message}`);
    }
  }
  
  // 记录撤销信息
  if (successCount > 0) {
    lastAction = {
      type: 'BATCH_DELETE',
      timestamp: Date.now(),
      data: deletedBookmarks.filter((_, index) => index < successCount)
    };
  }
  
  return {
    successCount,
    failedCount,
    total: bookmarkIds.length,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * moveBookmark
 * 中文说明：移动单个书签到指定文件夹
 * @param {string} bookmarkId 书签ID
 * @param {string} targetFolderId 目标文件夹ID
 * @returns {Promise<Object>} 移动结果
 */
async function moveBookmark(bookmarkId, targetFolderId) {
  if (!bookmarkId) {
    throw new Error('书签ID不能为空');
  }
  
  if (!targetFolderId) {
    throw new Error('目标文件夹ID不能为空');
  }
  
  try {
    // 获取书签当前信息
    const [bookmark] = await chrome.bookmarks.get(bookmarkId);
    const originalParentId = bookmark.parentId;
    const originalIndex = bookmark.index;
    
    // 移动书签
    await chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId });
    
    // 记录撤销信息
    lastAction = {
      type: 'MOVE',
      timestamp: Date.now(),
      data: {
        id: bookmarkId,
        originalParentId,
        originalIndex
      }
    };
    
    return { success: true };
  } catch (error) {
    throw new Error(`移动书签失败: ${error.message}`);
  }
}

/**
 * deleteBookmark
 * 中文说明：删除单个书签
 * @param {string} bookmarkId 书签ID
 * @returns {Promise<Object>} 删除结果
 */
async function deleteBookmark(bookmarkId) {
  if (!bookmarkId) {
    throw new Error('书签ID不能为空');
  }
  
  try {
    // 获取书签信息用于撤销
    const [bookmark] = await chrome.bookmarks.get(bookmarkId);
    
    // 删除书签
    await chrome.bookmarks.remove(bookmarkId);
    
    // 记录撤销信息
    lastAction = {
      type: 'DELETE',
      timestamp: Date.now(),
      data: {
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index
      }
    };
    
    return { success: true };
  } catch (error) {
    throw new Error(`删除书签失败: ${error.message}`);
  }
}

/**
 * updateBookmarkTitle
 * 中文说明：更新书签标题
 * @param {string} bookmarkId 书签ID
 * @param {string} newTitle 新标题
 * @returns {Promise<Object>} 更新结果
 */
async function updateBookmarkTitle(bookmarkId, newTitle) {
  if (!bookmarkId) {
    throw new Error('书签ID不能为空');
  }
  
  if (!newTitle || typeof newTitle !== 'string') {
    throw new Error('新标题不能为空');
  }
  
  try {
    // 获取书签当前信息
    const [bookmark] = await chrome.bookmarks.get(bookmarkId);
    const oldTitle = bookmark.title;
    
    // 更新书签标题
    await chrome.bookmarks.update(bookmarkId, { title: newTitle });
    
    // 记录撤销信息
    lastAction = {
      type: 'UPDATE_TITLE',
      timestamp: Date.now(),
      data: {
        id: bookmarkId,
        oldTitle: oldTitle,
        newTitle: newTitle
      }
    };
    
    return { success: true, oldTitle, newTitle };
  } catch (error) {
    throw new Error(`更新书签标题失败: ${error.message}`);
  }
}

/**
 * smartOrganizeByDomain
 * 中文说明：根据域名自动整理指定文件夹下的所有书签
 * - 在目标文件夹下为每个域名创建子文件夹
 * - 将书签移动到对应域名的子文件夹
 * - 记录撤销信息，支持一次性撤销
 */
async function smartOrganizeByDomain(folderId) {
  // 获取目标文件夹下的所有子项
  const children = await chrome.bookmarks.getChildren(folderId);
  if (!children || !children.length) return { moved: 0, createdFolders: 0 };

  // 构建域名到文件夹ID的映射，避免重复创建
  const domainFolderMap = new Map();
  let createdFolders = 0;
  let moved = 0;
  const moveActions = [];

  // 工具函数：获取或创建域名文件夹
  async function getOrCreateDomainFolder(domain) {
    if (domainFolderMap.has(domain)) return domainFolderMap.get(domain);
    // 尝试查找同名文件夹
    const siblings = await chrome.bookmarks.getChildren(folderId);
    const exist = siblings.find(it => !it.url && it.title === domain);
    let id = exist?.id;
    if (!id) {
      const created = await chrome.bookmarks.create({ parentId: folderId, title: domain });
      id = created.id;
      createdFolders++;
    }
    domainFolderMap.set(domain, id);
    return id;
  }

  // 提取域名
  const getDomain = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return '未知来源'; }
  };

  // 遍历仅顶层书签（不递归），按域名分组
  for (const c of children) {
    if (c.url) {
      const domain = getDomain(c.url);
      const targetFolderId = await getOrCreateDomainFolder(domain);
      if (c.parentId !== targetFolderId) {
        moveActions.push({ id: c.id, from: c.parentId, to: targetFolderId, index: 0 });
      }
    }
  }

  // 批量移动
  for (const act of moveActions) {
    await chrome.bookmarks.move(act.id, { parentId: act.to, index: act.index });
    moved++;
  }

  // 记录撤销
  if (moved > 0 || createdFolders > 0) {
    lastAction = {
      type: 'BATCH_MOVE',
      items: moveActions.map(a => ({ id: a.id, from: a.from, to: a.to })),
      createdFolders: domainFolderMap, // 记录创建的文件夹（名称->id）
    };
  }

  return { moved, createdFolders };
}

// 添加智能整理功能到现有的消息分发器中
function addSmartOrganizeHandler() {
  // 由于已经存在 defaultHandlers() 中的消息监听器，我们需要在那里添加新的 case
  // 这里只是确保函数可用，实际的 case 需要添加到第23行的监听器中
}

// 在 background.js 加载时确保智能整理函数可用
addSmartOrganizeHandler();

/**
 * fetchPageTitle
 * 中文说明：获取指定URL的网页标题，支持超时和重试机制
 * @param {string} url 网页URL
 * @param {number} timeout 超时时间（毫秒），默认8000ms
 * @param {number} retries 重试次数，默认1次
 * @returns {Promise<{title: string}>} 网页标题
 */
async function fetchPageTitle(url, timeout = 8000, retries = 1) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL不能为空或无效');
  }
  
  // 检查是否为特殊协议
  if (url.startsWith('chrome://') || 
      url.startsWith('chrome-extension://') || 
      url.startsWith('moz-extension://') ||
      url.startsWith('about:') ||
      url.startsWith('file://')) {
    throw new Error('不支持的协议类型');
  }
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // 解析HTML获取title标签内容
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        let title = '';
        
        if (titleMatch && titleMatch[1]) {
          // 解码HTML实体并清理空白字符
          title = titleMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        // 如果没有获取到标题，尝试从其他元素获取
        if (!title) {
          const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
          if (h1Match && h1Match[1]) {
            title = h1Match[1].trim();
          }
        }
        
        return { title: title || '无标题' };
        
      } finally {
        clearTimeout(timeoutId);
      }
      
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === retries;
      const errorMsg = error.message || String(error);
      
      // 记录错误信息
      console.warn(`fetchPageTitle 第${attempt + 1}次尝试失败 ${url}:`, errorMsg);
      
      // 如果是最后一次尝试，抛出错误
      if (isLastAttempt) {
        break;
      }
      
      // 等待一段时间后重试
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  
  // 所有尝试都失败了
  const errorMsg = lastError?.message || '未知错误';
  
  // 根据错误类型提供更具体的错误信息
  if (errorMsg.includes('CORS') || errorMsg.includes('cors')) {
    throw new Error('跨域限制：无法访问该网站');
  } else if (errorMsg.includes('timeout') || errorMsg.includes('aborted')) {
    throw new Error('请求超时：网站响应过慢');
  } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
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

/**
 * smartOrganize
 * 中文说明：根据不同策略对指定文件夹下的顶层书签进行分类整理
 * 支持策略：
 *  - domain：按域名（去除 www 前缀）
 *  - topDomain：按 eTLD+1（粗略基于 hostname 的最后两段）
 *  - pathPrefix：按 URL 路径的首段（/a/... -> a；空路径归入“根路径”）
 *  - keyword：按标题关键词（将首个空格分隔词作为“关键词”；没有标题归“未命名”）
 * 同时支持清理空文件夹选项
 * @param {string} folderId 目标文件夹 ID
 * @param {{strategy:'domain'|'topDomain'|'pathPrefix'|'keyword', cleanEmptyFolders?:boolean}} options 选项
 * @returns {Promise<{moved:number, createdFolders:number, cleanedFolders:number}>}
 */
async function smartOrganize(folderId, options = {}) {
  if (!folderId) throw new Error('folderId 不能为空');
  const { strategy = 'domain', cleanEmptyFolders = false } = options;

  // 读取顶层子项
  const children = await chrome.bookmarks.getChildren(folderId);
  if (!children || children.length === 0) return { moved: 0, createdFolders: 0, cleanedFolders: 0 };

  // 工具：安全解析 URL
  const parseUrl = (url) => {
    try { return new URL(url); } catch { return null; }
  };

  // 工具：提取域名
  const getDomain = (url) => {
    const u = parseUrl(url); if (!u) return '未知来源';
    return (u.hostname || '').replace(/^www\./, '') || '未知来源';
  };

  // 工具：提取顶级域名（简易 eTLD+1，无法覆盖公共后缀库，权衡体积）
  const getTopDomain = (url) => {
    const host = getDomain(url);
    const parts = host.split('.');
    if (parts.length <= 2) return host || '未知来源';
    // 简化规则：保留最后两段，如 example.co.uk -> co.uk（注意这并非严格 PSL 规则）
    return parts.slice(-2).join('.') || host;
  };

  // 工具：提取路径前缀
  const getPathPrefix = (url) => {
    const u = parseUrl(url); if (!u) return '根路径';
    const segs = (u.pathname || '/').split('/').filter(Boolean);
    return segs[0] ? `/${segs[0]}` : '根路径';
  };

  // 工具：提取标题关键词（首个以空格分隔的词）
  const getKeyword = (title) => {
    const t = (title || '').trim();
    if (!t) return '未命名';
    const first = t.split(/\s+/)[0];
    return first || '未命名';
  };

  // 根据策略选择分组 key 生成器
  const keyOf = (item) => {
    if (!item.url) return null; // 跳过文件夹子项
    switch (strategy) {
      case 'topDomain': return getTopDomain(item.url);
      case 'pathPrefix': return getPathPrefix(item.url);
      case 'keyword': return getKeyword(item.title);
      case 'domain':
      default: return getDomain(item.url);
    }
  };

  // 查重与缓存：在父文件夹下寻找已存在的同名子文件夹，避免重复创建
  const folderCache = new Map(); // name -> id
  const siblings = await chrome.bookmarks.getChildren(folderId);
  for (const s of siblings) {
    if (!s.url) folderCache.set(s.title, s.id);
  }

  const createdFoldersSet = new Set();
  const ensureFolder = async (name) => {
    if (folderCache.has(name)) return folderCache.get(name);
    const created = await chrome.bookmarks.create({ parentId: folderId, title: name });
    folderCache.set(name, created.id);
    createdFoldersSet.add(created.id);
    return created.id;
  };

  // 生成移动计划
  const movePlans = []; // { id, from, to, index }
  for (const c of children) {
    if (!c.url) continue; // 只整理顶层书签
    const key = keyOf(c);
    if (!key) continue;
    const toId = await ensureFolder(key);
    if (c.parentId !== toId) {
      movePlans.push({ id: c.id, from: c.parentId, to: toId, index: 0 });
    }
  }

  // 执行移动
  let moved = 0;
  for (const p of movePlans) {
    await chrome.bookmarks.move(p.id, { parentId: p.to, index: p.index });
    moved += 1;
  }

  // 可选：清理空文件夹（仅清理目标 folderId 的直接子文件夹，且不清理刚新建但为空的分类文件夹）
  let cleanedFolders = 0;
  const cleanedFolderInfos = [];
  if (cleanEmptyFolders) {
    const afterChildren = await chrome.bookmarks.getChildren(folderId);
    for (const it of afterChildren) {
      if (it.url) continue;
      // 跳过新建的分类文件夹，避免误删用户刚建但暂时为空的分类
      if (createdFoldersSet.has(it.id)) continue;
      const sub = await chrome.bookmarks.getChildren(it.id);
      if (!sub || sub.length === 0) {
        // 记录以便撤销时重建
        cleanedFolderInfos.push({ id: it.id, title: it.title, parentId: it.parentId, index: it.index ?? 0 });
        await chrome.bookmarks.removeTree(it.id);
        cleanedFolders += 1;
      }
    }
  }

  // 记录撤销信息
  if (moved > 0 || createdFoldersSet.size > 0 || cleanedFolders > 0) {
    lastAction = {
      type: 'BATCH_MOVE',
      data: movePlans.map(p => ({ id: p.id, originalParentId: p.from, originalIndex: 0 })),
      createdFolderIds: Array.from(createdFoldersSet),
      cleanedEmptyFolders: cleanedFolderInfos // 记录被清理的空文件夹，用于撤销重建
    };
  }

  return { moved, createdFolders: createdFoldersSet.size, cleanedFolders };
}

// 保留旧函数名以兼容现有调用（如果其他地方引用）
async function smartOrganizeByDomain(folderId) {
  return smartOrganize(folderId, { strategy: 'domain', cleanEmptyFolders: false });
}