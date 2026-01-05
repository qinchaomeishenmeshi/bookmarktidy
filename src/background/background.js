// 简化的背景脚本：只处理书签的基础操作
// 功能：获取、创建、更新、删除书签和文件夹

// 扩展安装时的初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Simple Bookmark Manager] 扩展已安装')
})

// 消息处理器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] 收到消息:', request.action)

  switch (request.action) {
    case 'getBookmarks':
    case 'getAllBookmarks':
      handleGetAllBookmarks(sendResponse)
      break
    case 'createBookmark':
      handleCreateBookmark(request, sendResponse)
      break
    case 'updateBookmark':
      handleUpdateBookmark(request, sendResponse)
      break
    case 'removeBookmark':
    case 'deleteBookmark':
      handleDeleteBookmark(request, sendResponse)
      break
    case 'createFolder':
      handleCreateFolder(request, sendResponse)
      break
    case 'moveBookmark':
      handleMoveBookmark(request, sendResponse)
      break
    case 'getBookmarkStats':
      handleGetBookmarkStats(sendResponse)
      break
    case 'getBookmarkFolders':
      handleGetBookmarkFolders(sendResponse)
      break
    case 'getBookmarkVisitStats':
      handleGetBookmarkVisitStats(request, sendResponse)
      break
    case 'getBookmarksWithVisitStats':
      handleGetBookmarksWithVisitStats(sendResponse)
      break
    case 'updateBackupSettings':
      handleUpdateBackupSettings(request, sendResponse)
      break
    case 'triggerBackup':
      handleTriggerBackup(sendResponse)
      break
    default:
      console.warn('[Background] 未知的操作:', request.action)
      sendResponse({ success: false, error: '未知的操作' })
      return false
  }

  // 返回true以保持消息通道开放，允许异步响应
  return true
})

/**
 * 获取所有书签
 */
async function handleGetAllBookmarks(sendResponse) {
  try {
    const bookmarkTree = await chrome.bookmarks.getTree()
    console.log('[Background] 原始书签树结构:', bookmarkTree)

    // Chrome书签API返回的是数组，第一个元素是根节点
    // 我们需要获取根节点的children来获取实际的书签数据
    const rootNode = bookmarkTree[0]
    const bookmarkData = rootNode.children || []

    console.log('[Background] 处理后的书签数据:', bookmarkData)
    sendResponse({ success: true, bookmarks: bookmarkData })
  } catch (error) {
    console.error('[Background] 获取书签失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 创建书签
 */
async function handleCreateBookmark(request, sendResponse) {
  try {
    const { title, url, parentId } = request
    const bookmark = await chrome.bookmarks.create({
      parentId: parentId || '1',
      title,
      url
    })
    console.log('[Background] 书签创建成功:', bookmark)
    sendResponse({ success: true, bookmark })
  } catch (error) {
    console.error('[Background] 创建书签失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 更新书签
 */
async function handleUpdateBookmark(request, sendResponse) {
  try {
    const { id, title, url } = request
    const changes = {}
    if (title !== undefined) changes.title = title
    if (url !== undefined) changes.url = url

    const bookmark = await chrome.bookmarks.update(id, changes)
    console.log('[Background] 书签更新成功:', bookmark)
    sendResponse({ success: true, bookmark })
  } catch (error) {
    console.error('[Background] 更新书签失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 删除书签
 */
async function handleDeleteBookmark(request, sendResponse) {
  try {
    const { id } = request
    await chrome.bookmarks.remove(id)
    console.log('[Background] 书签删除成功:', id)
    sendResponse({ success: true })
  } catch (error) {
    console.error('[Background] 删除书签失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 创建文件夹
 */
async function handleCreateFolder(request, sendResponse) {
  try {
    const { title, parentId } = request
    const folder = await chrome.bookmarks.create({
      parentId: parentId || '1',
      title
    })
    console.log('[Background] 文件夹创建成功:', folder)
    sendResponse({ success: true, folder })
  } catch (error) {
    console.error('[Background] 创建文件夹失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 移动书签
 */
async function handleMoveBookmark(request, sendResponse) {
  try {
    const { id, parentId, index } = request
    const destination = { parentId }
    if (index !== undefined) destination.index = index

    const bookmark = await chrome.bookmarks.move(id, destination)
    console.log('[Background] 书签移动成功:', bookmark)
    sendResponse({ success: true, bookmark })
  } catch (error) {
    console.error('[Background] 移动书签失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 获取书签统计信息
 */
async function handleGetBookmarkStats(sendResponse) {
  try {
    const tree = await chrome.bookmarks.getTree()
    let totalBookmarks = 0
    let totalFolders = 0

    // 递归统计书签和文件夹数量
    function countNodes(nodes) {
      for (const node of nodes) {
        if (node.url) {
          totalBookmarks++
        } else {
          totalFolders++
        }
        if (node.children) {
          countNodes(node.children)
        }
      }
    }

    countNodes(tree)

    sendResponse({
      success: true,
      stats: {
        totalBookmarks,
        totalFolders
      }
    })
  } catch (error) {
    console.error('[Background] 获取统计信息失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 获取书签文件夹列表（树形结构）
 */
async function handleGetBookmarkFolders(sendResponse) {
  try {
    const tree = await chrome.bookmarks.getTree()
    const root = tree[0].children || []

    // 找到书签栏节点
    const bookmarksBar = root.find(
      (item) => item.id === '1' || item.title === '书签栏' || item.title === 'Bookmarks bar'
    )

    if (!bookmarksBar) {
      throw new Error('未找到书签栏')
    }

    // 递归构建文件夹树结构
    function buildFolderTree(node, parentId = null) {
      if (node.url) {
        // 这是书签，不是文件夹
        return null
      }

      // 确定文件夹类型
      let folderType = 'other'
      if (node.id === '1' || node.title === '书签栏' || node.title === 'Bookmarks bar') {
        folderType = 'bookmarks-bar'
      }

      const folder = {
        id: node.id,
        title: node.title || '未命名文件夹',
        folderType: folderType,
        parentId: parentId,
        children: []
      }

      // 递归处理子节点
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          const childFolder = buildFolderTree(child, node.id)
          if (childFolder) {
            folder.children.push(childFolder)
          }
        }
      }

      return folder
    }

    const folderTree = buildFolderTree(bookmarksBar)

    console.log('[Background] 文件夹树结构:', folderTree)

    sendResponse({
      success: true,
      folders: folderTree ? [folderTree] : [] // 返回数组格式以保持兼容性
    })
  } catch (error) {
    console.error('[Background] 获取文件夹列表失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 获取单个书签的访问统计信息
 */
async function handleGetBookmarkVisitStats(request, sendResponse) {
  try {
    const { url } = request
    if (!url) {
      throw new Error('缺少URL参数')
    }

    // 使用chrome.history API查询访问统计
    const historyItems = await chrome.history.search({
      text: url,
      maxResults: 1
    })

    let visitCount = 0
    let lastVisitTime = null

    if (historyItems && historyItems.length > 0) {
      const item = historyItems.find((h) => h.url === url)
      if (item) {
        visitCount = item.visitCount || 0
        lastVisitTime = item.lastVisitTime || null
      }
    }

    sendResponse({
      success: true,
      stats: {
        url,
        visitCount,
        lastVisitTime
      }
    })
  } catch (error) {
    console.error('[Background] 获取访问统计失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 获取所有书签及其访问统计信息
 */
async function handleGetBookmarksWithVisitStats(sendResponse) {
  try {
    // 首先获取所有书签
    const bookmarkTree = await chrome.bookmarks.getTree()
    const bookmarks = []

    // 递归收集所有书签（非文件夹）
    function collectBookmarks(nodes) {
      for (const node of nodes) {
        if (node.url) {
          bookmarks.push({
            id: node.id,
            title: node.title,
            url: node.url,
            parentId: node.parentId,
            dateAdded: node.dateAdded
          })
        }
        if (node.children) {
          collectBookmarks(node.children)
        }
      }
    }

    collectBookmarks(bookmarkTree)

    // 批量获取访问统计信息
    const bookmarksWithStats = []
    const batchSize = 50 // 分批处理以避免性能问题

    for (let i = 0; i < bookmarks.length; i += batchSize) {
      const batch = bookmarks.slice(i, i + batchSize)
      const batchPromises = batch.map(async (bookmark) => {
        try {
          // 查询每个书签的访问统计
          const historyItems = await chrome.history.search({
            text: bookmark.url,
            maxResults: 1
          })

          let visitCount = 0
          let lastVisitTime = null

          if (historyItems && historyItems.length > 0) {
            const item = historyItems.find((h) => h.url === bookmark.url)
            if (item) {
              visitCount = item.visitCount || 0
              lastVisitTime = item.lastVisitTime || null
            }
          }

          return {
            ...bookmark,
            visitCount,
            lastVisitTime
          }
        } catch (error) {
          console.warn(`[Background] 获取书签 ${bookmark.url} 的访问统计失败:`, error)
          return {
            ...bookmark,
            visitCount: 0,
            lastVisitTime: null
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      bookmarksWithStats.push(...batchResults)
    }

    console.log(`[Background] 成功获取 ${bookmarksWithStats.length} 个书签的访问统计`)
    sendResponse({
      success: true,
      bookmarks: bookmarksWithStats
    })
  } catch (error) {
    console.error('[Background] 获取书签访问统计失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

/**
 * 定时备份相关的逻辑
 */

// 监听定时任务
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'scheduled-backup') {
    performBackup()
  }
})

// 执行备份操作
async function performBackup() {
  try {
    const tree = await chrome.bookmarks.getTree()
    const htmlContent = generateNetscapeBookmarkFile(tree)

    // 生成文件名：bookmark.html
    // const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `bookmark.html`

    // 使用 URL.createObjectURL 创建 Blob URL 进行下载会导致 Service Worker 中不可靠
    // 直接使用 data loop URI (对于小文件) 或者 ArrayBuffer
    // Chrome downloads API 支持 url 为 data:

    const base64Content = btoa(unescape(encodeURIComponent(htmlContent)))
    const url = `data:text/html;base64,${base64Content}`

    await chrome.downloads.download({
      url: url,
      filename: `BookmarkBackups/${filename}`, // 保存到下载目录的子文件夹
      conflictAction: 'overwrite',
      saveAs: false
    })

    // 更新最后备份时间
    chrome.storage.local.set({ lastBackupTime: Date.now() })
    console.log('[Background] 自动备份完成:', filename)
  } catch (error) {
    console.error('[Background] 备份失败:', error)
  }
}

// 生成 Netscape Bookmark File Format 格式的 HTML
function generateNetscapeBookmarkFile(tree) {
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`

  function traverse(nodes) {
    let result = ''
    for (const node of nodes) {
      if (node.children) {
        // Folder
        const title = node.title || ''
        const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : 0
        const lastModified = node.dateGroupModified ? Math.floor(node.dateGroupModified / 1000) : 0

        // 根节点不需要 DT 标签
        if (node.id === '0') {
          result += traverse(node.children)
          continue
        }

        result += `    <DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${lastModified}">${title}</H3>\n`
        result += `    <DL><p>\n`
        result += traverse(node.children)
        result += `    </DL><p>\n`
      } else if (node.url) {
        // Bookmark
        const title = node.title || ''
        const url = node.url
        const addDate = node.dateAdded ? Math.floor(node.dateAdded / 1000) : 0
        result += `    <DT><A HREF="${url}" ADD_DATE="${addDate}">${title}</A>\n`
      }
    }
    return result
  }

  html += traverse(tree[0].children) // 从根节点的子节点开始
  html += `</DL><p>`

  return html
}

// 处理备份设置更新
async function handleUpdateBackupSettings(request, sendResponse) {
  try {
    const { enabled, frequency } = request // frequency: 'daily', 'weekly', 'monthly'

    // 先清除旧的
    await chrome.alarms.clear('scheduled-backup')

    if (enabled) {
      let periodInMinutes = 60 * 24 // Default daily

      if (frequency === 'weekly') {
        periodInMinutes = 60 * 24 * 7
      } else if (frequency === 'monthly') {
        periodInMinutes = 60 * 24 * 30
      }

      chrome.alarms.create('scheduled-backup', {
        delayInMinutes: 1, // 开启后1分钟首次执行
        periodInMinutes: periodInMinutes
      })
      console.log(`[Background] 定时备份已开启: ${frequency}`)
    } else {
      console.log('[Background] 定时备份已关闭')
    }

    sendResponse({ success: true })
  } catch (error) {
    console.error('[Background] 更新备份设置失败:', error)
    sendResponse({ success: false, error: error.message })
  }
}

// 手动立即备份
async function handleTriggerBackup(sendResponse) {
  try {
    await performBackup()
    sendResponse({ success: true })
  } catch (error) {
    sendResponse({ success: false, error: error.message })
  }
}
