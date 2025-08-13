// 背景脚本（Service Worker）：作为任务中枢与消息路由
// 说明：此文件内的函数将添加中文注释，便于阅读与维护

// 引入工具脚本（MV3 Service Worker 支持 importScripts）
try { importScripts('utils/urlNormalizer.js'); } catch (e) { console.warn('无法加载 urlNormalizer 工具', e); }

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
      case 'MOVE': {
        // 恢复移动的书签到原位置
        const items = lastAction.type === 'MOVE' ? [lastAction.data] : lastAction.data;
        
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
        message = `成功恢复 ${restored} 个书签的位置`;
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