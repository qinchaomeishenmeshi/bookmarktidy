import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string;
  onAdd: (parentId: string, title: string) => Promise<any>;
}

export function FolderDialog({ 
  open, 
  onOpenChange, 
  parentId,
  onAdd 
}: FolderDialogProps) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    setLoading(true);
    try {
      await onAdd(parentId, title);
      setTitle('');
      onOpenChange(false);
    } catch (error) {
      console.error('Add folder failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription>
            在当前选中的目录下创建一个新的文件夹。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="folder-title">文件夹名称</Label>
            <Input 
              id="folder-title" 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="输入名称..."
              required 
              autoFocus
            />
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={loading}>
              {loading ? '创建中...' : '确认创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
