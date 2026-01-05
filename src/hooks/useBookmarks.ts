import { useState, useEffect, useCallback } from 'react'

export interface Bookmark {
  id: string
  title: string
  url?: string
  parentId?: string
  dateAdded?: number
  visitCount?: number
  lastVisitTime?: number | null
}

export interface Folder {
  id: string
  title: string
  parentId?: string
  children?: (Bookmark | Folder)[]
}

export interface FolderTreeNode extends Folder {
  children?: FolderTreeNode[]
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [folders, setFolders] = useState<FolderTreeNode[]>([])
  const [folderCount, setFolderCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) {
      console.warn('Chrome Bookmarks API unavailable')
      setLoading(false)
      return
    }

    try {
      const tree = await chrome.bookmarks.getTree()
      const allBookmarks: Bookmark[] = []
      const flatFolders: Folder[] = []

      function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
        for (const node of nodes) {
          if (node.url) {
            allBookmarks.push({
              id: node.id,
              title: node.title,
              url: node.url,
              parentId: node.parentId,
              dateAdded: node.dateAdded
            })
          } else {
            // ID '0' 是根Root, 通常不展示计数
            if (node.id !== '0') {
              flatFolders.push({
                id: node.id,
                title: node.title,
                parentId: node.parentId
              })
            }
            if (node.children) {
              traverse(node.children)
            }
          }
        }
      }

      traverse(tree)

      // 构建嵌套文件夹树
      function buildFolderTree(nodes: chrome.bookmarks.BookmarkTreeNode[]): FolderTreeNode[] {
        return nodes
          .filter((node) => !node.url) // 只选文件夹
          .map((node) => ({
            id: node.id,
            title: node.title,
            parentId: node.parentId,
            children: node.children ? buildFolderTree(node.children) : []
          }))
      }

      const folderTree = buildFolderTree(tree[0].children || [])

      setBookmarks(allBookmarks)
      setFolders(folderTree)
      setFolderCount(flatFolders.length)
    } catch (error) {
      console.error('Failed to load bookmarks:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()

    // 监听书签变化
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
      const listener = () => loadData()
      chrome.bookmarks.onCreated.addListener(listener)
      chrome.bookmarks.onRemoved.addListener(listener)
      chrome.bookmarks.onChanged.addListener(listener)
      chrome.bookmarks.onMoved.addListener(listener)

      return () => {
        chrome.bookmarks.onCreated.removeListener(listener)
        chrome.bookmarks.onRemoved.removeListener(listener)
        chrome.bookmarks.onChanged.removeListener(listener)
        chrome.bookmarks.onMoved.removeListener(listener)
      }
    }
  }, [loadData])

  const addFolder = async (parentId: string, title: string) => {
    return chrome.bookmarks.create({ parentId, title })
  }

  const removeBookmark = async (id: string) => {
    return chrome.bookmarks.remove(id)
  }

  const updateBookmark = async (id: string, changes: { title?: string; url?: string }) => {
    return chrome.bookmarks.update(id, changes)
  }

  const moveBookmark = async (id: string, parentId: string) => {
    return chrome.bookmarks.move(id, { parentId })
  }

  const batchRemove = async (ids: string[]) => {
    return Promise.all(ids.map((id) => chrome.bookmarks.remove(id)))
  }

  const batchMove = async (ids: string[], parentId: string) => {
    return Promise.all(ids.map((id) => chrome.bookmarks.move(id, { parentId })))
  }

  const getOrCreateRecycleBin = async () => {
    const tree = await chrome.bookmarks.getTree()
    const flatFolders: chrome.bookmarks.BookmarkTreeNode[] = []

    function findRecycleBin(
      nodes: chrome.bookmarks.BookmarkTreeNode[]
    ): chrome.bookmarks.BookmarkTreeNode | null {
      for (const node of nodes) {
        if (!node.url && node.title === '回收站') return node
        if (node.children) {
          const found = findRecycleBin(node.children)
          if (found) return found
        }
      }
      return null
    }

    const existing = findRecycleBin(tree)
    if (existing) return existing.id

    // 在书签栏创建
    const created = await chrome.bookmarks.create({
      parentId: '1',
      title: '回收站'
    })
    return created.id
  }

  const clearFolder = async (folderId: string) => {
    const tree = await chrome.bookmarks.getSubTree(folderId)
    const children = tree[0].children || []
    return Promise.all(
      children.map((child) => {
        if (child.url) {
          return chrome.bookmarks.remove(child.id)
        } else {
          return chrome.bookmarks.removeTree(child.id)
        }
      })
    )
  }

  const reorderChildren = async (parentId: string, orderedIds: string[]) => {
    // 串行执行以保证顺序
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i]
      // 将书签移动到指定位置
      await chrome.bookmarks.move(id, { parentId, index: i })
    }
  }

  return {
    bookmarks,
    folders,
    folderCount,
    loading,
    refresh: loadData,
    addFolder,
    removeBookmark,
    updateBookmark,
    moveBookmark,
    batchRemove,
    batchMove,
    getOrCreateRecycleBin,
    clearFolder,
    reorderChildren
  }
}
