import { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Bookmark, Folder } from '@/hooks/useBookmarks';

interface BookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookmark: Bookmark | null;
  folders: Folder[];
  onSave: (id: string | null, data: { title: string; url: string; parentId: string }) => Promise<void>;
}

export function BookmarkDialog({ 
  open, 
  onOpenChange, 
  bookmark, 
  folders, 
  onSave 
}: BookmarkDialogProps) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [parentId, setParentId] = useState('1');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (bookmark) {
      setTitle(bookmark.title || '');
      setUrl(bookmark.url || '');
      setParentId(bookmark.parentId || '1');
    } else {
      setTitle('');
      setUrl('');
      setParentId('1');
    }
  }, [bookmark, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(bookmark?.id || null, { title, url, parentId });
      onOpenChange(false);
    } catch (error) {
      console.error('Save failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{bookmark ? '编辑书签' : '添加书签'}</DialogTitle>
          <DialogDescription>
            {bookmark ? '更新选定书签的信息。' : '填写表单以创建新书签。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">名称</Label>
            <Input 
              id="title" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="书签名称"
              required 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="url">网址</Label>
            <Input 
              id="url" 
              type="url" 
              value={url} 
              onChange={(e) => setUrl(e.target.value)} 
              placeholder="https://..."
              required 
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="folder">文件夹</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger>
                <SelectValue placeholder="选择文件夹" />
              </SelectTrigger>
              <SelectContent>
                {folders.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                     {f.id === '1' ? '📁 书签栏' : `📁 ${f.title}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={loading}>
              {loading ? '保存中...' : '提交'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
