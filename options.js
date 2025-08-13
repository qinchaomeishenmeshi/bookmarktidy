// options 逻辑：保存/读取用户设置（断链检测开关）

/**
 * loadSettings
 * 中文说明：从 chrome.storage 读取设置并刷新界面
 */
async function loadSettings() {
  const { enableLinkCheck = true } = await chrome.storage.sync.get(['enableLinkCheck']);
  document.getElementById('enableLinkCheck').checked = !!enableLinkCheck;
}

/**
 * saveSettings
 * 中文说明：将界面上的设置保存到 chrome.storage
 */
async function saveSettings() {
  const enableLinkCheck = document.getElementById('enableLinkCheck').checked;
  await chrome.storage.sync.set({ enableLinkCheck });
  showSaved('已保存');
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