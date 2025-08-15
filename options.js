// options 逻辑：保存/读取用户设置（断链检测开关）

/**
 * loadSettings
 * 中文说明：从 chrome.storage 读取设置并刷新界面
 */
async function loadSettings() {
  // 检查是否在扩展环境中
  if (typeof chrome === 'undefined' || !chrome.storage) {
    console.warn('预览模式：chrome.storage API不可用，使用默认设置');
    // 设置默认值
    document.getElementById('enableLinkCheck').checked = false;
    document.getElementById('aiApiKey').value = '';
    document.getElementById('aiBatchSize').value = '20';
    document.getElementById('aiAutoClean').checked = true;
    return;
  }
  
  const settings = await chrome.storage.sync.get([
    'enableLinkCheck',
    'aiApiKey',
    'aiBatchSize',
    'aiAutoClean'
  ]);
  
  document.getElementById('enableLinkCheck').checked = !!settings.enableLinkCheck;
  document.getElementById('aiApiKey').value = settings.aiApiKey || '';
  document.getElementById('aiBatchSize').value = settings.aiBatchSize || '20';
  document.getElementById('aiAutoClean').checked = !!settings.aiAutoClean;
}

/**
 * saveSettings
 * 中文说明：保存设置到 chrome.storage
 */
async function saveSettings() {
  try {
    const settings = {
      enableLinkCheck: document.getElementById('enableLinkCheck').checked,
      aiApiKey: document.getElementById('aiApiKey').value.trim(),
      aiBatchSize: document.getElementById('aiBatchSize').value,
      aiAutoClean: document.getElementById('aiAutoClean').checked
    };
    
    // 检查是否在扩展环境中
    if (typeof chrome === 'undefined' || !chrome.storage) {
      console.warn('预览模式：chrome.storage API不可用，无法保存设置');
      showSaved('预览模式：设置无法保存');
      return;
    }
    
    await chrome.storage.sync.set(settings);
    showSaved('设置已保存');
  } catch (error) {
    console.error('保存设置失败:', error);
    showSaved('保存失败，请重试');
  }
}

/**
 * showSaved
 * 中文说明：展示保存状态的提示词，短暂显示后隐藏
 */
function showSaved(text) {
  const el = document.getElementById('saveStatus');
  el.textContent = text;
  setTimeout(() => (el.textContent = ''), 1500);
}

// 绑定事件并初始化
(function init() {
  document.getElementById('btnSave').addEventListener('click', saveSettings);
  loadSettings();
})();