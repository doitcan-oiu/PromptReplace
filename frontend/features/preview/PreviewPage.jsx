import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyReplacements } from "./apply-replacements.js";

export default function PreviewPage({ rules }) {
  const [text, setText] = useState("");
  const result = useMemo(() => applyReplacements(text, rules), [text, rules]);

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>原始文本</CardTitle>
          <CardDescription>使用当前页面启用的规则，按顺序预览替换效果。</CardDescription>
        </CardHeader>
        <CardContent><Label htmlFor="replacement-preview-input" className="sr-only">原始文本</Label><Textarea id="replacement-preview-input" value={text} onChange={event => setText(event.target.value)} rows={14} className="min-h-80 resize-y font-mono text-sm leading-6" placeholder="粘贴需要检查的文本…" spellCheck={false} /></CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2"><CardTitle>替换结果</CardTitle><Badge variant="secondary" className="font-normal tabular-nums" role="status" aria-live="polite">匹配 {result.count} 处</Badge></div>
          <CardDescription>替换内容留空的规则会删除匹配文字。</CardDescription>
        </CardHeader>
        <CardContent><Label htmlFor="replacement-preview-output" className="sr-only">替换结果</Label><Textarea id="replacement-preview-output" readOnly value={result.output} rows={14} className="min-h-80 resize-y bg-muted/30 font-mono text-sm leading-6" placeholder="替换结果将显示在这里" spellCheck={false} /></CardContent>
      </Card>
    </div>
  );
}
