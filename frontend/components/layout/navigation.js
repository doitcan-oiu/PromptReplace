import { FlaskConical, ListFilter, Plug } from "lucide-react";

export const navigation = [
  { id: "rules", label: "替换规则", description: "管理请求中的文字替换，按列表顺序依次执行。", icon: ListFilter },
  { id: "upstream", label: "上游配置", description: "设置接收替换后请求的接口地址和密钥。", icon: Plug },
  { id: "preview", label: "替换预览", description: "使用当前编辑的规则，检查文字替换结果。", icon: FlaskConical },
];
