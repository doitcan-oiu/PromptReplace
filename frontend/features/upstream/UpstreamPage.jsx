import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function UpstreamPage({
  baseUrl, onBaseUrlChange, keyValue, onKeyChange, hasStoredKey, clearKey,
  onRequestClearKey, onUndoClearKey, disabled, onCopyProxy, proxyUrl,
}) {
  const [showKey, setShowKey] = useState(false);
  const keyStatus = clearKey ? "保存后删除" : keyValue ? "待更新" : hasStoredKey ? "已配置" : "未配置";
  useEffect(() => { if (!keyValue) setShowKey(false); }, [keyValue]);

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>上游接口</CardTitle>
          <CardDescription>替换请求文本后，转发至此接口。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="upstream-base-url">接口基础地址</Label>
            <Input id="upstream-base-url" type="url" value={baseUrl} onChange={event => onBaseUrlChange(event.target.value)} disabled={disabled} placeholder="https://api.example.com/v1" autoComplete="off" spellCheck={false} aria-describedby="upstream-url-help" />
            <p id="upstream-url-help" className="text-sm leading-6 text-muted-foreground">支持 HTTP 和 HTTPS，可以包含 /v1 等路径前缀。</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><Label htmlFor="upstream-api-key">接口密钥</Label><Badge variant="secondary" className="font-normal">{keyStatus}</Badge></div>
            <div className="relative">
              <Input id="upstream-api-key" type={showKey ? "text" : "password"} value={keyValue} onChange={event => onKeyChange(event.target.value)} disabled={disabled} className="pr-11" autoComplete="new-password" spellCheck={false} placeholder={hasStoredKey ? "填写新密钥以替换已保存的密钥" : "输入上游 API Key"} aria-describedby="upstream-key-help" />
              <Button type="button" variant="ghost" size="icon" className="absolute top-0 right-0 size-9 text-muted-foreground" disabled={disabled} onClick={() => setShowKey(value => !value)} aria-label={showKey ? "隐藏新密钥" : "显示新密钥"}>{showKey ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</Button>
            </div>
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <p id="upstream-key-help" className="text-sm leading-6 text-muted-foreground">留空会保留当前密钥，已保存的密钥不会回显。</p>
              {(hasStoredKey || clearKey) && <Button type="button" variant="link" className="h-auto px-0 py-0 text-sm text-destructive" disabled={disabled} onClick={clearKey ? onUndoClearKey : onRequestClearKey}>{clearKey ? "撤销删除密钥" : "删除已保存的密钥"}</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>客户端接口地址</CardTitle>
          <CardDescription>将此地址填写到客户端的 OpenAI 兼容接口配置中。</CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="proxy-base-url" className="sr-only">客户端接口地址</Label>
          <div className="flex min-w-0 flex-wrap gap-2"><Input id="proxy-base-url" readOnly value={proxyUrl} className="min-w-0 flex-1 basis-56 bg-muted/40 font-mono text-sm" /><Button type="button" variant="outline" onClick={onCopyProxy}><Copy className="size-4" aria-hidden="true" />复制地址</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
