// 简化的弹出窗口脚本
// 提供基础的书签管理功能

// DOM 元素引用
const elements = {
  openManager: null,
  totalBookmarks: null,
  totalFolders: null,
  message: null,
  searchInput: null,
  clearSearch: null,
  searchResults: null
}

// 初始化函数
function init() {
  // 获取DOM元素
  elements.openManager = document.getElementById('openManager')
  elements.totalBookmarks = document.getElementById('totalBookmarks')
  elements.totalFolders = document.getElementById('totalFolders')
  elements.message = document.getElementById('message')
  elements.searchInput = document.getElementById('searchInput')
  elements.clearSearch = document.getElementById('clearSearch')
  elements.searchResults = document.getElementById('searchResults')

  // 绑定事件监听器
  bindEvents()

  // 加载统计数据
  loadBookmarkStats()
}

// 绑定事件监听器
function bindEvents() {
  // 打开管理器按钮
  elements.openManager.addEventListener('click', openBookmarkManager)

  // 搜索输入框事件
  elements.searchInput.addEventListener('input', handleSearchInput)
  elements.searchInput.addEventListener('keydown', handleSearchKeydown)

  // 清除搜索按钮
  elements.clearSearch.addEventListener('click', clearSearch)
}

// 打开书签管理器
function openBookmarkManager() {
  chrome.tabs.create({
    url: chrome.runtime.getURL('src/manager/manager.html')
  })
}

// 加载书签统计信息
async function loadBookmarkStats() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getBookmarkStats'
    })

    if (response.success) {
      elements.totalBookmarks.textContent = response.stats.totalBookmarks || 0
      elements.totalFolders.textContent = response.stats.totalFolders || 0
    } else {
      elements.totalBookmarks.textContent = '-'
      elements.totalFolders.textContent = '-'
    }
  } catch (error) {
    console.error('加载统计信息失败:', error)
    elements.totalBookmarks.textContent = '-'
    elements.totalFolders.textContent = '-'
  }
}

// 显示消息提示
function showMessage(text, type = 'success') {
  elements.message.textContent = text
  elements.message.className = `message ${type}`

  // 3秒后自动隐藏
  setTimeout(() => {
    elements.message.className = 'message hidden'
  }, 3000)
}

// 搜索相关变量
let searchTimeout = null
let allBookmarks = []

// 处理搜索输入
function handleSearchInput() {
  const query = elements.searchInput.value.trim()

  // 显示/隐藏清除按钮
  if (query) {
    elements.clearSearch.classList.add('visible')
  } else {
    elements.clearSearch.classList.remove('visible')
    hideSearchResults()
    return
  }

  // 防抖处理
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  searchTimeout = setTimeout(() => {
    performSearch(query)
  }, 300)
}

// 处理搜索键盘事件
function handleSearchKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    const query = elements.searchInput.value.trim()
    if (query) {
      performSearch(query)
    }
  } else if (event.key === 'Escape') {
    clearSearch()
  }
}

// 清除搜索
function clearSearch() {
  elements.searchInput.value = ''
  elements.clearSearch.classList.remove('visible')
  hideSearchResults()
  elements.searchInput.focus()
}

// 执行搜索
async function performSearch(query) {
  if (!query) {
    hideSearchResults()
    return
  }

  showSearchLoading()

  try {
    // 如果还没有加载书签数据，先加载
    if (allBookmarks.length === 0) {
      await loadAllBookmarks()
    }

    // 搜索书签
    const results = searchBookmarks(query, allBookmarks)
    displaySearchResults(results)
  } catch (error) {
    console.error('搜索失败:', error)
    showSearchError()
  }
}

// 加载所有书签
async function loadAllBookmarks() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((bookmarkTree) => {
      allBookmarks = []
      extractBookmarks(bookmarkTree, allBookmarks)
      resolve()
    })
  })
}

// 递归提取书签
function extractBookmarks(nodes, bookmarks) {
  for (const node of nodes) {
    if (node.url) {
      // 是书签
      bookmarks.push({
        id: node.id,
        title: node.title || '',
        url: node.url,
        dateAdded: node.dateAdded
      })
    } else if (node.children) {
      // 是文件夹，递归处理
      extractBookmarks(node.children, bookmarks)
    }
  }
}

// 搜索书签
function searchBookmarks(query, bookmarks) {
  const lowerQuery = query.toLowerCase()

  return bookmarks
    .filter((bookmark) => {
      const titleMatch = bookmark.title.toLowerCase().includes(lowerQuery)
      const urlMatch = bookmark.url.toLowerCase().includes(lowerQuery)
      return titleMatch || urlMatch
    })
    .slice(0, 10) // 限制显示10个结果
}

// 显示搜索结果
function displaySearchResults(results) {
  elements.searchResults.innerHTML = ''

  if (results.length === 0) {
    elements.searchResults.innerHTML = '<div class="search-no-results">没有找到相关书签</div>'
  } else {
    results.forEach((bookmark) => {
      const item = document.createElement('div')
      item.className = 'search-result-item'
      item.innerHTML = `
        <div class="search-result-title" title="${escapeHtml(bookmark.title)}">${escapeHtml(
        bookmark.title || bookmark.url
      )}</div>
        <div class="search-result-url" title="${escapeHtml(bookmark.url)}">${escapeHtml(
        bookmark.url
      )}</div>
      `

      // 点击打开书签
      item.addEventListener('click', () => {
        chrome.tabs.create({ url: bookmark.url })
        window.close()
      })

      elements.searchResults.appendChild(item)
    })
  }

  showSearchResults()
}

// 显示搜索加载状态
function showSearchLoading() {
  elements.searchResults.innerHTML = '<div class="search-loading">正在搜索...</div>'
  showSearchResults()
}

// 显示搜索错误
function showSearchError() {
  elements.searchResults.innerHTML = '<div class="search-no-results">搜索出现错误，请重试</div>'
  showSearchResults()
}

// 显示搜索结果区域
function showSearchResults() {
  elements.searchResults.classList.remove('hidden')
}

// 隐藏搜索结果区域
function hideSearchResults() {
  elements.searchResults.classList.add('hidden')
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init)

// 错误处理
window.addEventListener('error', (event) => {
  console.error('弹出窗口脚本错误:', event.error)
})

// 未处理的Promise拒绝
window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的Promise拒绝:', event.reason)
})
