// 全局状态管理
const state = {
  bookmarks: [],
  folders: [],
  currentFolder: null,
  searchQuery: "",
  editingBookmark: null,
  sortBy: "title", // 默认按标题排序
};

// DOM元素引用 - 将在init函数中初始化
let elements = {};

// 初始化应用 - 版本: 2025-08-19-11:37
async function init() {
  console.log("初始化书签管理器... [版本: 2025-08-19-11:37]");

  try {
    // 初始化DOM元素引用
    elements.totalBookmarks = document.getElementById("totalBookmarks");
    elements.totalFolders = document.getElementById("totalFolders");
    elements.folderTree = document.getElementById("folderTree");
    elements.breadcrumb = document.getElementById("breadcrumb");
    elements.searchInput = document.getElementById("searchInput");
    elements.sortSelect = document.getElementById("sortSelect");
    elements.bookmarkList = document.getElementById("bookmarkList");
    elements.newFolderBtn = document.getElementById("newFolderBtn");
    elements.newFolderModal = document.getElementById("newFolderModal");
    elements.editBookmarkModal = document.getElementById("editBookmarkModal");
    elements.toast = document.getElementById("toast");

    console.log("DOM元素初始化完成");

    // 加载数据 - 注意顺序：先加载书签和文件夹，再计算统计数据
    await loadBookmarks();
    await loadFolders();
    await loadStats(); // 统计数据依赖于书签和文件夹数据

    // 绑定事件
    bindEvents();

    // 渲染界面
    renderFolderTree();
    renderBookmarks();

    console.log("书签管理器初始化完成");
  } catch (error) {
    console.error("初始化失败:", error);
    showToast("初始化失败: " + error.message, "error");
  }
}

// 检查是否在Chrome扩展环境中
function isExtensionEnvironment() {
  return (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.sendMessage
  );
}

// 模拟书签数据（用于开发测试）
function getMockBookmarks() {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000; // 一天的毫秒数
  
  return [
    {
      id: "1",
      title: "Vue.js 官方文档",
      url: "https://vuejs.org",
      parentId: "0",
      dateAdded: now - oneDay * 5, // 5天前
    },
    {
      id: "2",
      title: "GitHub",
      url: "https://github.com",
      parentId: "0",
      dateAdded: now - oneDay * 2, // 2天前
    },
    {
      id: "3",
      title: "MDN Web Docs",
      url: "https://developer.mozilla.org",
      parentId: "0",
      dateAdded: now - oneDay * 10, // 10天前
    },
    {
      id: "4",
      title: "TypeScript 官网",
      url: "https://www.typescriptlang.org",
      parentId: "0",
      dateAdded: now - oneDay * 1, // 1天前
    },
    {
      id: "5",
      title: "Vite 构建工具",
      url: "https://vitejs.dev",
      parentId: "0",
      dateAdded: now - oneDay * 7, // 7天前
    },
  ];
}

// 加载书签数据
async function loadBookmarks() {
  try {
    if (isExtensionEnvironment()) {
      const response = await chrome.runtime.sendMessage({
        action: "getBookmarks",
      });
      if (response.success) {
        state.bookmarks = flattenBookmarks(response.bookmarks);
        console.log("书签加载完成:", state.bookmarks.length);
      } else {
        throw new Error(response.error || "获取书签失败");
      }
    } else {
      // 开发环境使用模拟数据
      console.log("开发环境：使用模拟书签数据");
      state.bookmarks = flattenBookmarks(getMockBookmarks());
      console.log("模拟书签加载完成:", state.bookmarks.length);
    }
  } catch (error) {
    console.error("加载书签失败:", error);
    throw error;
  }
}

// 模拟文件夹数据
function getMockFolders() {
  // 返回树形结构的模拟文件夹数据
  return [
    {
      id: "1",
      title: "书签栏",
      folderType: "bookmarks-bar",
      parentId: null,
      children: [
        {
          id: "3",
          title: "工作相关",
          folderType: "other",
          parentId: "1",
          children: [
            {
              id: "4",
              title: "开发工具",
              folderType: "other",
              parentId: "3",
              children: []
            },
            {
              id: "5",
              title: "设计资源",
              folderType: "other",
              parentId: "3",
              children: []
            }
          ]
        },
        {
          id: "6",
          title: "学习资料",
          folderType: "other",
          parentId: "1",
          children: [
            {
              id: "7",
              title: "前端技术",
              folderType: "other",
              parentId: "6",
              children: []
            }
          ]
        },
        {
          id: "8",
          title: "娱乐",
          folderType: "other",
          parentId: "1",
          children: []
        }
      ]
    }
  ];
}

// 模拟统计数据（用于开发测试）- 动态计算
function getMockStats() {
  // 动态计算书签数量
  const totalBookmarks = state.bookmarks.length;

  // 动态计算文件夹数量
  const totalFolders = state.folders.length;

  return {
    totalBookmarks,
    totalFolders,
  };
}

// 加载文件夹数据
async function loadFolders() {
  try {
    if (isExtensionEnvironment()) {
      const response = await chrome.runtime.sendMessage({
        action: "getBookmarkFolders",
      });
      if (response.success) {
        state.folders = response.folders;
        console.log("文件夹加载完成:", state.folders.length);
      } else {
        throw new Error(response.error || "获取文件夹失败");
      }
    } else {
      // 开发环境使用模拟数据
      console.log("开发环境：使用模拟文件夹数据");
      state.folders = getMockFolders();
      console.log("模拟文件夹加载完成:", state.folders.length);
    }
  } catch (error) {
    console.error("加载文件夹失败:", error);
    throw error;
  }
}

// 加载统计数据
async function loadStats() {
  try {
    console.log("开始加载统计数据...");
    console.log("DOM元素检查:", {
      totalBookmarks: elements.totalBookmarks,
      totalFolders: elements.totalFolders,
    });

    if (isExtensionEnvironment()) {
      const response = await chrome.runtime.sendMessage({
        action: "getBookmarkStats",
      });
      if (response.success) {
        elements.totalBookmarks.textContent = response.stats.totalBookmarks;
        elements.totalFolders.textContent = response.stats.totalFolders;
        console.log("统计数据加载完成:", response.stats);
      } else {
        throw new Error(response.error || "获取统计数据失败");
      }
    } else {
      // 开发环境使用模拟数据
      console.log("开发环境：使用模拟统计数据");
      const stats = getMockStats();
      console.log("计算得到的统计数据:", stats);
      console.log("当前状态:", {
        bookmarks: state.bookmarks.length,
        folders: state.folders.length,
      });

      if (elements.totalBookmarks && elements.totalFolders) {
        elements.totalBookmarks.textContent = stats.totalBookmarks;
        elements.totalFolders.textContent = stats.totalFolders;
        console.log("统计数据已更新到DOM:", {
          totalBookmarks: elements.totalBookmarks.textContent,
          totalFolders: elements.totalFolders.textContent,
        });
      } else {
        console.error("DOM元素未找到!");
      }
    }
  } catch (error) {
    console.error("加载统计数据失败:", error);
  }
}

// 扁平化书签树结构
function flattenBookmarks(bookmarkTree, result = []) {
  for (const node of bookmarkTree) {
    if (node.url) {
      // 这是一个书签
      result.push({
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId,
        dateAdded: node.dateAdded,
      });
    } else if (node.children) {
      // 这是一个文件夹，递归处理子项
      flattenBookmarks(node.children, result);
    }
  }
  return result;
}

// 绑定事件监听器
function bindEvents() {
  // 搜索功能
  elements.searchInput.addEventListener("input", handleSearch);

  // 排序功能
  elements.sortSelect.addEventListener("change", handleSortChange);

  // 添加文件夹
  elements.newFolderBtn.addEventListener("click", showNewFolderModal);

  // 模态框事件
  bindModalEvents();
}

// 绑定模态框事件
function bindModalEvents() {
  // 关闭按钮
  document.querySelectorAll(".close-btn").forEach((btn) => {
    btn.addEventListener("click", closeAllModals);
  });

  // 点击背景关闭
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAllModals();
    });
  });

  // 表单提交
  document
    .getElementById("newFolderForm")
    .addEventListener("submit", handleNewFolder);
  document
    .getElementById("editBookmarkForm")
    .addEventListener("submit", handleEditBookmark);
}

// 搜索处理
function handleSearch(e) {
  state.searchQuery = e.target.value.toLowerCase();
  renderBookmarks();
}

// 排序处理 - 支持同步到Chrome书签
async function handleSortChange(e) {
  state.sortBy = e.target.value;
  
  // 如果在扩展环境中，同步排序到Chrome书签
  if (isExtensionEnvironment()) {
    await applySortToChromeBookmarks();
  }
  
  renderBookmarks();
}

// 书签排序函数
function sortBookmarks(bookmarks, sortBy) {
  const sorted = [...bookmarks];
  
  switch (sortBy) {
    case 'title':
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case 'dateAdded':
      return sorted.sort((a, b) => {
        // 按添加时间降序排列（最新的在前）
        const dateA = a.dateAdded || 0;
        const dateB = b.dateAdded || 0;
        return dateB - dateA;
      });
    case 'url':
      return sorted.sort((a, b) => a.url.localeCompare(b.url));
    default:
      return sorted;
  }
}

// 将排序应用到Chrome书签中
async function applySortToChromeBookmarks() {
  try {
    showToast("正在同步排序到Chrome书签...", "info");
    
    // 获取当前文件夹的书签
    const currentFolderBookmarks = getCurrentFolderBookmarks();
    
    if (currentFolderBookmarks.length === 0) {
      return;
    }
    
    // 按当前排序方式排序
    const sortedBookmarks = sortBookmarks(currentFolderBookmarks, state.sortBy);
    
    // 获取当前文件夹ID
    const parentId = state.currentFolder || "1"; // 默认书签栏
    
    // 逐个移动书签到新位置
    for (let i = 0; i < sortedBookmarks.length; i++) {
      const bookmark = sortedBookmarks[i];
      
      // 调用Chrome API移动书签
      const response = await chrome.runtime.sendMessage({
        action: "moveBookmark",
        id: bookmark.id,
        parentId: parentId,
        index: i // 新的位置索引
      });
      
      if (!response.success) {
        throw new Error(`移动书签失败: ${response.error}`);
      }
    }
    
    showToast(`书签排序已同步到Chrome（按${getSortDisplayName(state.sortBy)}）`, "success");
    
    // 重新加载书签数据以反映Chrome中的变化
    await refreshData();
    
  } catch (error) {
    console.error("同步排序到Chrome失败:", error);
    showToast("同步排序失败: " + error.message, "error");
  }
}

// 获取当前文件夹的书签
function getCurrentFolderBookmarks() {
  let bookmarks = state.bookmarks;
  
  // 如果选择了特定文件夹，只获取该文件夹的书签
  if (state.currentFolder) {
    bookmarks = bookmarks.filter(bookmark => bookmark.parentId === state.currentFolder);
  }
  
  // 应用搜索过滤
  if (state.searchQuery) {
    bookmarks = bookmarks.filter(bookmark => 
      bookmark.title.toLowerCase().includes(state.searchQuery) ||
      bookmark.url.toLowerCase().includes(state.searchQuery)
    );
  }
  
  return bookmarks;
}

// 获取排序方式的显示名称
function getSortDisplayName(sortBy) {
  switch (sortBy) {
    case 'title': return '标题';
    case 'dateAdded': return '添加时间';
    case 'url': return '网址';
    default: return '默认';
  }
}



// 渲染文件夹树
// 渲染文件夹树（支持多层级结构）
function renderFolderTree() {
  const folders = state.folders;
  console.log("文件夹树数据:", folders);

  if (!folders || folders.length === 0) {
    elements.folderTree.innerHTML = '<div class="no-folders">暂无文件夹</div>';
    return;
  }

  // 递归渲染文件夹树
  function renderFolderNode(folder, level = 0) {
    const indent = level * 20; // 每级缩进20px
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = folder.expanded !== false; // 默认展开
    
    let html = `
      <div class="folder-item ${state.currentFolder === folder.id ? 'active' : ''}" 
           data-folder-id="${folder.id}" 
           style="padding-left: ${indent}px;">
        <span class="folder-toggle ${hasChildren ? (isExpanded ? 'expanded' : 'collapsed') : 'no-children'}" 
              data-folder-id="${folder.id}">
          ${hasChildren ? (isExpanded ? '▼' : '▶') : '　'}
        </span>
        <span class="folder-icon">📁</span>
        <span class="folder-title" data-folder-id="${folder.id}">${folder.title}</span>
        ${folder.folderType === 'bookmarks-bar' ? '<span class="folder-badge">书签栏</span>' : ''}
      </div>
    `;

    // 如果有子文件夹且处于展开状态，递归渲染子文件夹
    if (hasChildren && isExpanded) {
      for (const child of folder.children) {
        html += renderFolderNode(child, level + 1);
      }
    }

    return html;
  }

  // 渲染所有根级文件夹
  const html = folders.map(folder => renderFolderNode(folder)).join('');
  elements.folderTree.innerHTML = html;

  // 绑定文件夹点击事件
  bindFolderTreeEvents();
}

// 绑定文件夹树事件
function bindFolderTreeEvents() {
  // 绑定文件夹选择事件
  elements.folderTree.querySelectorAll('.folder-title').forEach(title => {
    title.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = title.dataset.folderId;
      selectFolder(folderId);
    });
  });

  // 绑定展开/折叠事件
  elements.folderTree.querySelectorAll('.folder-toggle').forEach(toggle => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = toggle.dataset.folderId;
      toggleFolderExpansion(folderId);
    });
  });
}

// 切换文件夹展开/折叠状态
function toggleFolderExpansion(folderId) {
  // 递归查找并切换文件夹的展开状态
  function toggleInTree(folders) {
    for (const folder of folders) {
      if (folder.id === folderId) {
        folder.expanded = !folder.expanded;
        return true;
      }
      if (folder.children && toggleInTree(folder.children)) {
        return true;
      }
    }
    return false;
  }

  toggleInTree(state.folders);
  renderFolderTree(); // 重新渲染树
}

// 选择文件夹
function selectFolder(folderId) {
  state.currentFolder = folderId;

  // 更新文件夹选中状态
  elements.folderTree.querySelectorAll(".folder-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.folderId === folderId);
  });

  // 更新面包屑
  const folder = state.folders.find((f) => f.id === folderId);
  elements.breadcrumb.textContent = folder
    ? `📁 ${folder.title}`
    : "📚 所有书签";

  // 重新渲染书签
  renderBookmarks();
}

// 渲染书签列表
function renderBookmarks() {
  let filteredBookmarks = state.bookmarks;

  // 按文件夹过滤
  if (state.currentFolder) {
    filteredBookmarks = filteredBookmarks.filter(
      (bookmark) => bookmark.parentId === state.currentFolder
    );
  }

  // 按搜索关键词过滤
  if (state.searchQuery) {
    filteredBookmarks = filteredBookmarks.filter(
      (bookmark) =>
        bookmark.title.toLowerCase().includes(state.searchQuery) ||
        bookmark.url.toLowerCase().includes(state.searchQuery)
    );
  }

  // 应用排序
  filteredBookmarks = sortBookmarks(filteredBookmarks, state.sortBy);

  if (filteredBookmarks.length === 0) {
    elements.bookmarkList.innerHTML = `
      <div class="empty-state">
        <div>📚 暂无书签</div>
        <p>点击"添加书签"开始管理您的书签</p>
      </div>
    `;
    return;
  }

  const html = filteredBookmarks
    .map(
      (bookmark) => {
        // 格式化添加时间
        const dateAdded = bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : '未知时间';
        
        return `
    <div class="bookmark-item" data-bookmark-id="${bookmark.id}">
      <div class="bookmark-favicon">🔖</div>
      <div class="bookmark-content">
        <a href="${bookmark.url}" class="bookmark-title" target="_blank">
          ${bookmark.title}
        </a>
        <div class="bookmark-url">${bookmark.url}</div>
        <div class="bookmark-date">添加时间: ${dateAdded}</div>
      </div>
      <div class="bookmark-actions">
        <button class="action-btn edit-btn" title="编辑">
          ✏️
        </button>
        <button class="action-btn danger delete-btn" title="删除">
          🗑️
        </button>
      </div>
    </div>
  `;
      }
    )
    .join("");

  elements.bookmarkList.innerHTML = html;

  // 绑定书签操作事件
  bindBookmarkEvents();
}

// 绑定书签操作事件
function bindBookmarkEvents() {
  // 编辑按钮
  elements.bookmarkList.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const bookmarkId = btn.closest(".bookmark-item").dataset.bookmarkId;
      editBookmark(bookmarkId);
    });
  });

  // 删除按钮
  elements.bookmarkList.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const bookmarkId = btn.closest(".bookmark-item").dataset.bookmarkId;
      deleteBookmark(bookmarkId);
    });
  });
}

// 显示新建文件夹模态框
function showNewFolderModal() {
  elements.newFolderModal.classList.remove("hidden");
}

// 编辑书签
function editBookmark(bookmarkId) {
  const bookmark = state.bookmarks.find((b) => b.id === bookmarkId);
  if (!bookmark) return;

  state.editingBookmark = bookmark;

  // 填充表单
  document.getElementById("editTitle").value = bookmark.title;
  document.getElementById("editUrl").value = bookmark.url;

  populateFolderSelect("editFolder", bookmark.parentId);

  elements.editBookmarkModal.classList.remove("hidden");
}

// 删除书签
async function deleteBookmark(bookmarkId) {
  if (!confirm("确定要删除这个书签吗？")) return;

  try {
    if (isExtensionEnvironment()) {
      const response = await chrome.runtime.sendMessage({
        action: "deleteBookmark",
        bookmarkId,
      });

      if (response.success) {
        showToast("书签删除成功", "success");
        await refreshData();
      } else {
        throw new Error(response.error || "删除失败");
      }
    } else {
      // 开发环境模拟删除
      console.log("开发环境：模拟删除书签", bookmarkId);
      state.bookmarks = state.bookmarks.filter((b) => b.id !== bookmarkId);

      // 更新统计数据
      await loadStats();

      showToast("书签删除成功（模拟）", "success");
      renderBookmarks();
    }
  } catch (error) {
    console.error("删除书签失败:", error);
    showToast("删除失败: " + error.message, "error");
  }
}

// 填充文件夹选择器
// 填充文件夹选择下拉框（支持树形结构）
function populateFolderSelect(selectId, selectedId = null) {
  const select = document.getElementById(selectId);
  
  // 递归生成文件夹选项
  function generateFolderOptions(folders, level = 0) {
    let options = '';
    const indent = '　'.repeat(level); // 使用全角空格缩进
    
    for (const folder of folders) {
      options += `<option value="${folder.id}" ${
        folder.id === selectedId ? "selected" : ""
      }>${indent}${folder.title}</option>`;
      
      // 递归处理子文件夹
      if (folder.children && folder.children.length > 0) {
        options += generateFolderOptions(folder.children, level + 1);
      }
    }
    
    return options;
  }
  
  const options = generateFolderOptions(state.folders);
  select.innerHTML = `<option value="">选择文件夹</option>${options}`;
}



// 处理新建文件夹
async function handleNewFolder(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const folderName = formData.get("folderName");

  try {
    if (isExtensionEnvironment()) {
      const response = await chrome.runtime.sendMessage({
        action: "createFolder",
        title: folderName,
        parentId: "1", // 默认在书签栏下创建
      });

      if (response.success) {
        showToast("文件夹创建成功", "success");
        closeAllModals();
        e.target.reset();
        await refreshData();
      } else {
        throw new Error(response.error || "创建失败");
      }
    } else {
      // 开发环境模拟创建文件夹
      console.log("开发环境：模拟创建文件夹", folderName);
      const newFolder = {
        id: Date.now().toString(),
        title: folderName,
      };
      state.folders.push(newFolder);

      // 更新统计数据
      await loadStats();

      showToast("文件夹创建成功（模拟）", "success");
      closeAllModals();
      e.target.reset();
      renderFolderTree();
    }
  } catch (error) {
    console.error("创建文件夹失败:", error);
    showToast("创建失败: " + error.message, "error");
  }
}

// 处理编辑书签
async function handleEditBookmark(e) {
  e.preventDefault();

  if (!state.editingBookmark) return;

  const formData = new FormData(e.target);
  const updateData = {
    bookmarkId: state.editingBookmark.id,
    title: formData.get("title"),
    url: formData.get("url"),
  };

  const newParentId = formData.get("folder");
  if (newParentId && newParentId !== state.editingBookmark.parentId) {
    updateData.parentId = newParentId;
  }

  try {
    if (isExtensionEnvironment()) {
      const response = await chrome.runtime.sendMessage({
        action: "updateBookmark",
        ...updateData,
      });

      if (response.success) {
        showToast("书签更新成功", "success");
        closeAllModals();
        state.editingBookmark = null;
        await refreshData();
      } else {
        throw new Error(response.error || "更新失败");
      }
    } else {
      // 开发环境模拟更新
      console.log("开发环境：模拟更新书签", updateData);
      const bookmarkIndex = state.bookmarks.findIndex(
        (b) => b.id === updateData.bookmarkId
      );
      if (bookmarkIndex !== -1) {
        state.bookmarks[bookmarkIndex] = {
          ...state.bookmarks[bookmarkIndex],
          title: updateData.title,
          url: updateData.url,
          parentId:
            updateData.parentId || state.bookmarks[bookmarkIndex].parentId,
        };
      }
      showToast("书签更新成功（模拟）", "success");
      closeAllModals();
      state.editingBookmark = null;
      renderBookmarks();
    }
  } catch (error) {
    console.error("更新书签失败:", error);
    showToast("更新失败: " + error.message, "error");
  }
}

// 关闭所有模态框
function closeAllModals() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.classList.add("hidden");
  });
  state.editingBookmark = null;
}

// 刷新数据
async function refreshData() {
  try {
    // 重新加载数据 - 确保正确的加载顺序
    await loadBookmarks();
    await loadFolders();
    await loadStats(); // 重新计算统计数据

    // 重新渲染界面
    renderFolderTree();
    renderBookmarks();

    console.log("数据刷新完成");
  } catch (error) {
    console.error("刷新数据失败:", error);
  }
}

// 显示消息提示
function showToast(message, type = "success") {
  elements.toast.textContent = message;
  elements.toast.className = `toast ${type}`;

  // 显示提示
  elements.toast.classList.remove("hidden");

  // 3秒后自动隐藏
  setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 3000);
}

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", init);

// 导出供调试使用
window.bookmarkManager = {
  state,
  refreshData,
  showToast,
};
