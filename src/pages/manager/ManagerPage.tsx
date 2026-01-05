import { useState, useMemo, useCallback } from 'react';
import { useBookmarks, Bookmark, FolderTreeNode } from '@/hooks/useBookmarks';
import { useStats } from '@/hooks/useStats';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { BookmarkDialog } from '@/components/BookmarkDialog';
import { FolderDialog } from '@/components/FolderDialog';
import { 
  Folder as FolderIcon, 
  Search, 
  Trash2, 
  Edit, 
  Plus,
  Loader2,
  ChevronRight,
  ChevronDown,
  Activity,
  CheckCircle,
  X,
  Eraser,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

// 递归文件夹组件
interface FolderTreeItemProps {
  folder: FolderTreeNode;
  currentFolder: string | null;
  onSelect: (id: string) => void;
  onClear: (id: string) => void;
  level: number;
}

function FolderTreeItem({ folder, currentFolder, onSelect, onClear, level }: FolderTreeItemProps) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = folder.children && folder.children.length > 0;
  
  return (
    <div className="space-y-1">
      <div 
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-all group h-9",
          currentFolder === folder.id ? "bg-primary/10 text-primary shadow-sm" : "hover:bg-muted text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelect(folder.id)}
      >
        <div 
          className="w-4 h-4 flex items-center justify-center"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }
          }}
        >
          {hasChildren ? (
            isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : null}
        </div>
        <FolderIcon className={cn(
          "h-4 w-4 shrink-0",
          currentFolder === folder.id ? "text-primary" : "text-muted-foreground group-hover:text-primary"
        )} />
        <span className="text-sm truncate font-medium">
          {folder.id === '1' ? '书签栏' : (folder.title || '未命名')}
        </span>
        {folder.title === '回收站' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 ml-auto opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onClear(folder.id);
            }}
            title="清空回收站"
          >
            <Eraser className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      
      {hasChildren && isOpen && (
        <div className="space-y-1">
          {folder.children!.map(child => (
            <FolderTreeItem 
              key={child.id} 
              folder={child} 
              currentFolder={currentFolder} 
              onSelect={onSelect} 
              onClear={onClear}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ManagerPage() {
  const { 
    bookmarks, 
    folders, 
    loading, 
    removeBookmark, 
    addFolder,
    updateBookmark,
    moveBookmark,
    batchRemove,
    batchMove,
    getOrCreateRecycleBin,
    clearFolder,
    reorderChildren
  } = useBookmarks();
  const { stats, loading: loadingStats } = useStats();
  
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'title' | 'dateAdded' | 'url' | 'visitCount'>('title');

  // 对话框状态
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isSyncingOrder, setIsSyncingOrder] = useState(false);
  const [checkProgress, setCheckProgress] = useState(0);

  // 过滤书签
  const filteredBookmarks = useMemo(() => {
    let result = bookmarks.map(b => ({
      ...b,
      visitCount: stats[b.id]?.count || 0,
      lastVisitTime: stats[b.id]?.lastVisit || null
    }));

    if (currentFolder) {
      result = result.filter(b => b.parentId === currentFolder);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => 
        (b.title?.toLowerCase().includes(q) || b.url?.toLowerCase().includes(q))
      );
    }

    // 排序
    return [...result].sort((a, b) => {
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'dateAdded') return (b.dateAdded || 0) - (a.dateAdded || 0);
      if (sortBy === 'url') return (a.url || '').localeCompare(b.url || '');
      if (sortBy === 'visitCount') return (b.visitCount || 0) - (a.visitCount || 0);
      return 0;
    });
  }, [bookmarks, stats, currentFolder, searchQuery, sortBy]);

  const summaryStats = useMemo(() => ({
    total: bookmarks.length,
    folders: folders.length
  }), [bookmarks, folders]);

  // 展开所有文件夹为扁平列表，用于下拉选择
  const flatFoldersList = useMemo(() => {
    const list: { id: string, title: string }[] = [];
    function flatten(nodes: FolderTreeNode[]) {
      nodes.forEach(n => {
        list.push({ id: n.id, title: n.title || (n.id === '1' ? '书签栏' : '未命名') });
        if (n.children) flatten(n.children);
      });
    }
    flatten(folders);
    return list;
  }, [folders]);

  const handleEditBookmark = (bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setBookmarkDialogOpen(true);
  };

  const handleCreateBookmark = () => {
    setEditingBookmark(null);
    setBookmarkDialogOpen(true);
  };

  const handleSaveBookmark = async (id: string | null, data: { title: string; url: string; parentId: string }) => {
    if (id) {
      const original = bookmarks.find(b => b.id === id);
      if (original) {
        if (original.title !== data.title || original.url !== data.url) {
          await updateBookmark(id, { title: data.title, url: data.url });
        }
        if (original.parentId !== data.parentId) {
          await moveBookmark(id, data.parentId);
        }
      }
    } else {
      if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        await chrome.bookmarks.create({
          parentId: data.parentId,
          title: data.title,
          url: data.url
        });
      }
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    if (confirm('确定要删除这个书签吗？')) {
      await removeBookmark(id);
      setSelectedIds(prev => prev.filter(sid => sid !== id));
    }
  };

  const handleToggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
    );
  };

  const handleBatchDelete = async () => {
    if (confirm(`确定要删除选中的 ${selectedIds.length} 个书签吗？`)) {
      await batchRemove(selectedIds);
      setSelectedIds([]);
    }
  };

  const handleCheckHealth = async () => {
    setIsCheckingHealth(true);
    setCheckProgress(0);
    const recycleBinId = await getOrCreateRecycleBin();
    const bookmarksToCheck = filteredBookmarks.filter(b => b.url);
    const invalidIds: string[] = [];
    
    for (let i = 0; i < bookmarksToCheck.length; i++) {
      const b = bookmarksToCheck[i];
      setCheckProgress(Math.round(((i + 1) / bookmarksToCheck.length) * 100));
      
      try {
        // 使用 HEAD 请求探测，带上超时
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        await fetch(b.url!, { 
          method: 'HEAD', 
          mode: 'no-cors',
          signal: controller.signal 
        });
        clearTimeout(timeout);
      } catch (err) {
        console.warn(`Health check failed for ${b.url}:`, err);
        invalidIds.push(b.id);
      }
    }

    if (invalidIds.length > 0) {
      await batchMove(invalidIds, recycleBinId);
      alert(`检查完成！发现 ${invalidIds.length} 个失效书签，已移至“回收站”。`);
    } else {
      alert('检查完成！所有书签状态良好。');
    }
    
    setIsCheckingHealth(false);
    setCheckProgress(0);
  };

  const handleSyncOrder = async () => {
    if (!currentFolder) return;
    
    if (confirm(`确定要按照当前的排序方式（${
      sortBy === 'title' ? '名称' :
      sortBy === 'dateAdded' ? '时间' :
      sortBy === 'url' ? '网址' : '频率'
    }）重新排列该文件夹下的所有书签吗？`)) {
      setIsSyncingOrder(true);
      try {
        const orderedIds = filteredBookmarks.map(b => b.id);
        await reorderChildren(currentFolder, orderedIds);
        // 等待一下以确保 Chrome 更新完成
        await new Promise(resolve => setTimeout(resolve, 500));
        alert('排序同步完成！');
      } catch (err) {
        console.error('Failed to sync order:', err);
        alert('同步失败，请重试');
      } finally {
        setIsSyncingOrder(false);
      }
    }
  };

  const handleClearRecycleBin = async (folderId: string) => {
    if (confirm('确定要永久删除回收站内的所有书签吗？操作不可撤销。')) {
      await clearFolder(folderId);
    }
  };

  const currentFolderTitle = useMemo(() => {
    return flatFoldersList.find(f => f.id === currentFolder)?.title || '所有书签';
  }, [currentFolder, flatFoldersList]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">正在加载书签数据...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* 侧边栏 */}
      <aside className="w-64 border-r flex flex-col bg-card">
        <div className="h-16 px-6 border-b flex items-center justify-between">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <span className="text-2xl">📚</span> 清简书签
          </h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
              视图
            </div>
            <Button 
              variant={currentFolder === null ? 'secondary' : 'ghost'} 
              className="w-full justify-start gap-2 h-9 px-3"
              onClick={() => setCurrentFolder(null)}
            >
              <FolderIcon className="h-4 w-4" /> 所有书签
            </Button>
          </div>
          
          <div>
            <div className="px-3 mb-2 text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
              我的文件夹
            </div>
            <div className="space-y-1">
              {folders.map(folder => (
                <FolderTreeItem 
                  key={folder.id} 
                  folder={folder} 
                  currentFolder={currentFolder} 
                  onSelect={setCurrentFolder} 
                  onClear={handleClearRecycleBin}
                  level={0}
                />
              ))}
            </div>
          </div>
        </div>
        
        <div className="p-4 border-t">
           <Button variant="outline" className="w-full gap-2 border-dashed h-9" onClick={() => setFolderDialogOpen(true)}>
             <Plus className="h-4 w-4" /> 新建文件夹
           </Button>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <header className="h-16 border-b flex items-center justify-between px-6 bg-card">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="搜索标题或网址..." 
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button size="sm" className="gap-2 h-9" onClick={handleCreateBookmark}>
               <Plus className="h-4 w-4" /> 添加书签
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              className="gap-2 h-9 border-primary/20 hover:border-primary/50 text-primary" 
              onClick={handleCheckHealth}
              disabled={isCheckingHealth}
            >
               {isCheckingHealth ? (
                 <Loader2 className="h-4 w-4 animate-spin" />
               ) : (
                 <Activity className="h-4 w-4" />
               )}
               {isCheckingHealth ? `检查中 ${checkProgress}%` : '检查健康状态'}
            </Button>
            {currentFolderTitle === '回收站' && bookmarks.some(b => b.parentId === currentFolder) && (
              <Button
                size="sm"
                variant="destructive"
                className="gap-2 h-9 shadow-sm"
                onClick={() => handleClearRecycleBin(currentFolder!)}
              >
                <Eraser className="h-4 w-4" /> 一键清空回收站
              </Button>
            )}
          </div>

          <div className="flex items-center gap-6">
             <div className="text-xs text-muted-foreground hidden sm:block">
               共 <strong>{filteredBookmarks.length}</strong> 条书签
             </div>
             <div className="flex items-center gap-3">
               <span className="text-xs font-medium text-muted-foreground">排序:</span>
               <select 
                className="text-xs bg-transparent border-none outline-none font-semibold text-primary cursor-pointer hover:underline"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
               >
                 <option value="title">按名称</option>
                 <option value="dateAdded">按时间</option>
                 <option value="url">按网址</option>
                  <option value="visitCount">按频率</option>
                </select>
                {currentFolder && (
                   <Button 
                     variant="ghost" 
                     size="icon" 
                     className="h-6 w-6 text-muted-foreground hover:text-primary"
                     title="将当前排序同步到 Chrome 浏览器"
                     onClick={handleSyncOrder}
                     disabled={isSyncingOrder}
                   >
                     <RefreshCw className={cn("h-3.5 w-3.5", isSyncingOrder && "animate-spin")} />
                   </Button>
                )}
              </div>
          </div>
        </header>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-8 bg-muted/40">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
            {filteredBookmarks.map(bookmark => (
              <Card 
                key={bookmark.id} 
                className={cn(
                  "group hover:ring-2 hover:ring-primary/30 transition-all border-border shadow-md hover:shadow-xl hover:-translate-y-1 overflow-hidden bg-card duration-300 relative",
                  selectedIds.includes(bookmark.id) && "ring-2 ring-primary border-primary/50"
                )}
              >

                <CardHeader className="p-4 pb-3 flex flex-row items-center justify-between space-y-0 h-14">
                  <div 
                    className={cn(
                      "transition-opacity",
                      selectedIds.includes(bookmark.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                     <Checkbox 
                      checked={selectedIds.includes(bookmark.id)} 
                      onCheckedChange={() => handleToggleSelection(bookmark.id)}
                      className="bg-background border-muted-foreground/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 hover:bg-background"
                      onClick={() => handleEditBookmark(bookmark)}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteBookmark(bookmark.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex gap-2 items-start">
                      <div className="mt-0.5 shrink-0 w-4 h-4 flex items-center justify-center">
                        {bookmark.url ? (
                          <img 
                            src={`/_favicon/?pageUrl=${encodeURIComponent(bookmark.url)}&size=64`}
                            alt=""
                            className="w-4 h-4 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style');
                            }}
                          />
                        ) : null}
                        <span className="text-sm absolute" style={bookmark.url ? { display: 'none' } : {}}>🔖</span>
                      </div>
                      <a 
                        href={bookmark.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="font-bold text-sm line-clamp-2 hover:text-primary transition-colors block leading-tight min-h-[1.25rem]"
                        title={bookmark.title}
                      >
                        {bookmark.title || '无标题'}
                      </a>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-1 font-mono opacity-60 ml-6" title={bookmark.url}>
                      {bookmark.url}
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="outline" className="text-[10px] font-medium bg-background/50 border-muted-foreground/10 px-1.5 py-0 h-5">
                      📅 {bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleDateString() : '未知'}
                    </Badge>
                    {(bookmark.visitCount ?? 0) > 0 && (
                      <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 h-5 bg-primary/10 text-primary border-none">
                        📊 {bookmark.visitCount}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            
            {filteredBookmarks.length === 0 && (
              <div className="col-span-full py-40 flex flex-col items-center justify-center space-y-6">
                <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center text-5xl grayscale opacity-40">
                   📭
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-foreground">没有找到书签</h3>
                  <p className="text-sm text-muted-foreground mt-2">试试搜索其他内容，或者切换文件夹</p>
                </div>
                {searchQuery && (
                   <Button variant="outline" size="lg" className="px-8" onClick={() => setSearchQuery('')}>清空搜索</Button>
                )}
              </div>
            )}
          </div>

          {/* 批量操作条 */}
          {selectedIds.length > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-6 py-3 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom z-50">
              <div className="flex items-center gap-2 border-r border-primary-foreground/20 pr-6">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-bold">已选中 {selectedIds.length} 项</span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 hover:bg-white/10 text-white"
                  onClick={handleBatchDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> 批量删除
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 hover:bg-white/10 text-white"
                  onClick={() => setSelectedIds([])}
                >
                  <X className="h-4 w-4 mr-2" /> 取消
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 对话框 */}
      <BookmarkDialog 
        open={bookmarkDialogOpen}
        onOpenChange={setBookmarkDialogOpen}
        bookmark={editingBookmark}
        folders={flatFoldersList as any} // 传扁平列表用于选择
        onSave={handleSaveBookmark}
      />
      
      <FolderDialog 
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        parentId={currentFolder || '1'}
        onAdd={addFolder}
      />
    </div>
  );
}
