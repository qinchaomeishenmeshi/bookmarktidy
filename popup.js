// 简化的弹出窗口脚本
// 提供基础的书签管理功能

// DOM 元素引用
const elements = {
  openManager: null,
  totalBookmarks: null,
  totalFolders: null,
  message: null
};

// 初始化函数
function init() {
  // 获取DOM元素
  elements.openManager = document.getElementById('openManager');
  elements.totalBookmarks = document.getElementById('totalBookmarks');
  elements.totalFolders = document.getElementById('totalFolders');
  elements.message = document.getElementById('message');

  // 绑定事件监听器
  bindEvents();
  
  // 加载统计数据
  loadBookmarkStats();
}

// 绑定事件监听器
function bindEvents() {
  // 打开管理器按钮
  elements.openManager.addEventListener('click', openBookmarkManager);
}

// 打开书签管理器
function openBookmarkManager() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('manager.html')
  });
}

// 加载书签统计信息
async function loadBookmarkStats() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getBookmarkStats'
    });
    
    if (response.success) {
      elements.totalBookmarks.textContent = response.stats.totalBookmarks || 0;
      elements.totalFolders.textContent = response.stats.totalFolders || 0;
    } else {
      elements.totalBookmarks.textContent = '-';
      elements.totalFolders.textContent = '-';
    }
  } catch (error) {
    console.error('加载统计信息失败:', error);
    elements.totalBookmarks.textContent = '-';
    elements.totalFolders.textContent = '-';
  }
}

// 显示消息提示
function showMessage(text, type = 'success') {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`;
  
  // 3秒后自动隐藏
  setTimeout(() => {
    elements.message.className = 'message hidden';
  }, 3000);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 错误处理
window.addEventListener('error', (event) => {
  console.error('弹出窗口脚本错误:', event.error);
});

// 未处理的Promise拒绝
window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的Promise拒绝:', event.reason);
});