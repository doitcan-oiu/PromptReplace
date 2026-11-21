import { TooltipProvider } from "@/components/ui/tooltip";
import { LoginPage } from "@/components/auth/LoginPage";
import { LoadErrorScreen, LoadingScreen } from "@/components/auth/SessionScreens";
import { AppShell } from "@/components/layout/AppShell";
import { ConfirmAction } from "@/components/shared/ConfirmAction";
import { StatusNotice } from "@/components/shared/StatusNotice";
import RulesPage from "@/features/rules/RulesPage";
import UpstreamPage from "@/features/upstream/UpstreamPage";
import PreviewPage from "@/features/preview/PreviewPage";
import { useProxyConfig } from "@/hooks/useProxyConfig";

export default function App() {
  const config = useProxyConfig();
  let content;
  if (config.phase === "loading") content = <LoadingScreen />;
  else if (config.phase === "error") content = <LoadErrorScreen message={config.notice?.message || config.loadError} authenticated={config.session?.authenticated} busy={config.busy} onReload={config.load} onLogout={config.requestLogout} />;
  else if (config.phase === "login") content = <LoginPage configured={config.session?.configured} authNotice={config.authNotice} onLogin={config.login} onReload={config.load} />;
  else content = <AppShell page={config.page} onNavigate={config.setPage} dirty={config.dirty} saved={config.saved} busy={config.busy} onSave={config.save} onReload={config.requestReload} onLogout={config.requestLogout}>
    <StatusNotice notice={config.notice} onDismiss={config.dismissNotice} />
    <section hidden={config.page !== "rules"} aria-label="替换规则"><RulesPage rules={config.draft.rules} disabled={config.busy} onChange={config.changeRule} onCommit={config.commitRule} onMove={config.moveRule} onDelete={config.requestDeleteRule} /></section>
    <section hidden={config.page !== "upstream"} aria-label="上游配置"><UpstreamPage baseUrl={config.draft.upstreamBaseUrl} onBaseUrlChange={config.setBaseUrl} keyValue={config.upstreamKey} onKeyChange={config.setKey} hasStoredKey={Boolean(config.saved.hasUpstreamKey)} clearKey={config.clearKey} onRequestClearKey={config.requestClearKey} onUndoClearKey={config.undoClearKey} disabled={config.busy} onCopyProxy={config.copyProxy} proxyUrl={window.location.origin + "/v1"} /></section>
    <section hidden={config.page !== "preview"} aria-label="替换预览"><PreviewPage rules={config.draft.rules} /></section>
  </AppShell>;
  return <TooltipProvider delayDuration={300}>{content}<ConfirmAction confirmation={config.confirmation} onClose={config.closeConfirmation} onConfirm={config.confirmAction} /></TooltipProvider>;
}
