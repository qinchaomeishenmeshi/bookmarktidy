import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldCheck, Save, Loader2 } from 'lucide-react';

export default function OptionsPage() {
  const [enableLinkCheck, setEnableLinkCheck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['enableLinkCheck'], (result) => {
        setEnableLinkCheck(!!result.enableLinkCheck);
      });
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);

    if (typeof chrome === 'undefined' || !chrome.storage) {
      setTimeout(() => {
        setSaving(false);
        setStatus('预览模式：无法保存设置');
      }, 500);
      return;
    }

    try {
      await chrome.storage.sync.set({ enableLinkCheck });
      setStatus('设置已保存');
    } catch (error) {
      setStatus('保存失败，请重试');
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(null), 2000);
    }
  }, [enableLinkCheck]);

  return (
    <div className="min-h-screen bg-muted/30 py-12 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">扩展设置</h1>
          <p className="text-muted-foreground">配置您的书签管理偏好</p>
        </header>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <CardTitle>安全与检测</CardTitle>
            </div>
            <CardDescription>
              配置书签的深度检测功能
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start space-x-3 space-y-0 text-sm">
              <Checkbox 
                id="linkCheck" 
                checked={enableLinkCheck} 
                onCheckedChange={(checked) => setEnableLinkCheck(!!checked)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="linkCheck"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  启用断链检测
                </label>
                <p className="text-muted-foreground">
                  后台将定期检查您的书签是否仍可访问。此功能可能需要额外的跨域权限。
                </p>
              </div>
            </div>

            <div className="pt-4">
              <Button 
                onClick={handleSave} 
                disabled={saving} 
                className="w-full gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? '正在保存...' : '保存更改'}
              </Button>
              {status && (
                <div className="mt-4 text-center text-sm font-medium animate-in fade-in slide-in-from-top-1 text-primary">
                  {status}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
