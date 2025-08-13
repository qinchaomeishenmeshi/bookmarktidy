// URL 规范化工具
// 说明：为去重功能提供统一的 URL 标准化规则

/**
 * normalizeUrl
 * 中文说明：将 URL 规范化，减少因格式差异导致的重复识别误差
 * @param {string} url - 原始 URL
 * @param {object} options - 配置选项
 * @returns {string} 规范化后的 URL
 */
function normalizeUrl(url, options = {}) {
  // 默认配置
  const config = {
    ignoreProtocol: true,        // 忽略 http/https 差异
    removeUtmParams: true,       // 移除 UTM 等跟踪参数
    removeHash: true,            // 移除哈希片段
    normalizeTrailingSlash: true, // 标准化末尾斜杠
    lowercaseHost: true,         // 主机名小写
    ...options
  };

  try {
    const urlObj = new URL(url);
    
    // 主机名小写
    if (config.lowercaseHost) {
      urlObj.hostname = urlObj.hostname.toLowerCase();
    }

    // 忽略协议差异：统一为 https
    if (config.ignoreProtocol) {
      urlObj.protocol = 'https:';
    }

    // 移除常见跟踪参数
    if (config.removeUtmParams) {
      const paramsToRemove = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', 'msclkid', '_ga', 'ref', 'referrer'
      ];
      paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
    }

    // 移除哈希片段
    if (config.removeHash) {
      urlObj.hash = '';
    }

    // 标准化末尾斜杠
    if (config.normalizeTrailingSlash) {
      if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
    }

    return urlObj.toString();
  } catch (e) {
    // 无效 URL 则返回原值
    console.warn('无法解析 URL:', url, e);
    return url;
  }
}

/**
 * generateDuplicateGroups
 * 中文说明：对书签列表按规范化 URL 分组，找出重复项
 * @param {Array} bookmarks - 书签节点数组（必须包含 url 字段）
 * @param {object} normalizeOptions - URL 规范化配置
 * @returns {Map} Map<规范化URL, 书签数组>
 */
function generateDuplicateGroups(bookmarks, normalizeOptions = {}) {
  const groups = new Map();

  for (const bookmark of bookmarks) {
    if (!bookmark.url) continue; // 跳过文件夹等无 URL 节点

    const normalized = normalizeUrl(bookmark.url, normalizeOptions);
    if (!groups.has(normalized)) {
      groups.set(normalized, []);
    }
    groups.get(normalized).push(bookmark);
  }

  // 仅返回有重复的组（size > 1）
  const duplicates = new Map();
  for (const [url, items] of groups) {
    if (items.length > 1) {
      duplicates.set(url, items);
    }
  }

  return duplicates;
}

// 导出给其他模块使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeUrl, generateDuplicateGroups };
}