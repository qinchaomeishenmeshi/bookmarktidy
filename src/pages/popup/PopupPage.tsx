import { useState, useMemo } from 'react';
import { useBookmarks } from '@/hooks/useBookmarks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, ExternalLink, BarChart3 } from 'lucide-react';

export default function PopupPage() {
  const { bookmarks, folderCount, loading } = useBookmarks();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredResults = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return bookmarks.filter(b => 
      b.title?.toLowerCase().includes(q) || b.url?.toLowerCase().includes(q)
    ).slice(0, 5);
  }, [bookmarks, searchQuery]);

  const openManager = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
       chrome.runtime.openOptionsPage();
    } else {
       window.open('manager.html');
    }
  };

  return (
    <div className="w-[320px] bg-background">
      <header className="p-4 border-b bg-card">
        <h1 className="text-center font-bold text-primary flex items-center justify-center gap-2">
           <span>📚</span> 清简书签
        </h1>
      </header>

      <main className="p-4 space-y-4">
        {/* 快速搜索 */}
        <section className="space-y-2">
          <div className="text-[10px] font-bold text-muted-foreground tracking-widest flex items-center gap-2">
             <Search className="h-3 w-3" /> 快速搜索
          </div>
          <div className="relative">
            <Input 
              placeholder="搜索标题或网址..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pr-8"
            />
            {searchQuery && (
              <button 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
          
          {searchQuery && (
            <div className="border rounded-md divide-y bg-popover shadow-lg">
              {filteredResults.map(b => (
                <a 
                  key={b.id} 
                  href={b.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 block hover:bg-accent transition-colors"
                >
                  <div className="text-xs font-medium truncate">{b.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">{b.url}</div>
                </a>
              ))}
              {filteredResults.length === 0 && (
                 <div className="p-4 text-center text-xs text-muted-foreground">未找到匹配项</div>
              )}
            </div>
          )}
        </section>

        {/* 统计概览 */}
        <section className="space-y-2">
          <div className="text-[10px] font-bold text-muted-foreground tracking-widest flex items-center gap-2">
             <BarChart3 className="h-3 w-3" /> 数据概览
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Card className="shadow-none bg-muted/30 border-dashed">
               <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-primary">{loading ? '-' : bookmarks.length}</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">总书签</div>
               </CardContent>
            </Card>
            <Card className="shadow-none bg-muted/30 border-dashed">
               <CardContent className="p-3 text-center">
                  <div className="text-xl font-bold text-primary">{loading ? '-' : folderCount}</div>
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">文件夹</div>
               </CardContent>
            </Card>
          </div>
        </section>

        {/* 快速进入 */}
        <section className="pt-2">
           <Button className="w-full gap-2" onClick={openManager}>
             <ExternalLink className="h-4 w-4" /> 进入管理器
           </Button>
        </section>
      </main>


    </div>
  );
}
