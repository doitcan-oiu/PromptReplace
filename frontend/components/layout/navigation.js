import { ListFilter, Plug, ShieldAlert } from "lucide-react";

export const navigation = [
  { id: "rules", label: "替换规则", description: "管理请求中的文字替换，按列表顺序依次执行。", icon: ListFilter },
  { id: "interceptions", label: "拦截管理", description: "查看上游返回 HTTP 429 时保存的 system 提示词，记录排查结果。", icon: ShieldAlert },
  { id: "upstream", label: "上游配置", description: "设置接收替换后请求的接口地址和密钥。", icon: Plug },
];
