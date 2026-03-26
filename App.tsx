import { FormEvent, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  BadgeCheck,
  KeyRound,
  LoaderCircle,
  LogOut,
  MessageSquare,
  MessageSquareShare,
  QrCode,
  Send,
  Smartphone,
  Trash2,
  Webhook,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Separator } from "./components/ui/separator";
import { Textarea } from "./components/ui/textarea";
import { API_BASE_URL, api, publicWebhookURL } from "./lib/api";
import { cn } from "./lib/utils";
import type { Account, LoginSession, MessageRecord, Session, Webhook as WebhookItem } from "./types";

const inputClassName = "h-11 rounded-xl border-slate-200 bg-white";

type DashboardView = "wechat" | "messages" | "webhooks" | "send" | "settings";
type DashboardRoute = `/${DashboardView}`;

const defaultRoute: DashboardRoute = "/wechat";

const routeByView: Record<DashboardView, DashboardRoute> = {
  wechat: "/wechat",
  messages: "/messages",
  webhooks: "/webhooks",
  send: "/send",
  settings: "/settings",
};

const viewByRoute: Record<DashboardRoute, DashboardView> = {
  "/wechat": "wechat",
  "/messages": "messages",
  "/webhooks": "webhooks",
  "/send": "send",
  "/settings": "settings",
};

type NavItem = {
  key: DashboardView;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { key: "wechat", label: "微信接入", icon: Smartphone },
  { key: "messages", label: "消息", icon: MessageSquare },
  { key: "webhooks", label: "Webhook", icon: Webhook },
  { key: "send", label: "测试发送", icon: Send },
  { key: "settings", label: "设置", icon: KeyRound },
];

const emptyWebhookForm = {
  name: "",
};

const emptySendForm = {
  text: "",
  mediaUrl: "",
  fileName: "",
};

const emptySettingsForm = {
  currentToken: "",
  newToken: "",
  confirmToken: "",
};

type ToastTone = "error" | "success";

type ToastItemData = {
  id: number;
  tone: ToastTone;
  text: string;
};

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);

  const [activeView, setActiveView] = useState<DashboardView>(() => getViewFromHash(window.location.hash));
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessageKeyRef = useRef("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toasts, setToasts] = useState<ToastItemData[]>([]);

  const [loginForm, setLoginForm] = useState({ token: "" });
  const [qrLogin, setQrLogin] = useState<LoginSession | null>(null);
  const [qrStatus, setQrStatus] = useState("尚未开始扫码");

  const [webhookForm, setWebhookForm] = useState(emptyWebhookForm);
  const [editingWebhookId, setEditingWebhookId] = useState("");
  const [editingWebhookName, setEditingWebhookName] = useState("");
  const [sendForm, setSendForm] = useState(emptySendForm);
  const [settingsForm, setSettingsForm] = useState(emptySettingsForm);

  useEffect(() => {
    setActiveView(syncViewFromHash());
    const handleHashChange = () => {
      setActiveView(syncViewFromHash());
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (!error) return;
    pushToast("error", error);
    setError("");
  }, [error]);

  useEffect(() => {
    if (!notice) return;
    pushToast("success", notice);
    setNotice("");
  }, [notice]);

  useEffect(() => {
    if (!session || activeView !== "messages") return;
    if (!account) {
      lastMessageKeyRef.current = "";
      setMessages([]);
      return;
    }

    let cancelled = false;

    const refreshMessages = async () => {
      try {
        const data = await api<{ messages: MessageRecord[] }>("/api/messages?limit=200");
        if (!cancelled) {
          setMessages(data.messages);
        }
      } catch {}
    };

    void refreshMessages();
    const timer = window.setInterval(() => {
      void refreshMessages();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [account, activeView, session]);

  useEffect(() => {
    if (activeView !== "messages") return;

    const lastMessage = messages[messages.length - 1];
    const nextKey = lastMessage ? `${lastMessage.id}:${lastMessage.message_id}:${lastMessage.created_at}` : "";
    if (nextKey === lastMessageKeyRef.current) {
      return;
    }

    lastMessageKeyRef.current = nextKey;
    const viewport = messagesScrollRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [activeView, messages]);

  async function restoreSession() {
    try {
      const data = await api<{ session: Session }>("/api/auth/session");
      setSession(data.session);
      await loadDashboard();
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    setError("");
    const [accountResp, webhooksResp] = await Promise.all([
      api<{ account: Account | null }>("/api/account"),
      api<{ webhooks: WebhookItem[] }>("/api/webhooks"),
    ]);

    setAccount(accountResp.account);
    setWebhooks(webhooksResp.webhooks);
    if (!accountResp.account) {
      lastMessageKeyRef.current = "";
      setMessages([]);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const data = await api<{ session: Session }>("/api/auth/login", {
        method: "POST",
        json: { token: loginForm.token },
      });
      setSession(data.session);
      await loadDashboard();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      setSession(null);
      setLoginForm({ token: "" });
      setAccount(null);
      setWebhooks([]);
      setEditingWebhookId("");
      setEditingWebhookName("");
      lastMessageKeyRef.current = "";
      setMessages([]);
      setQrLogin(null);
      setNotice("");
      setSettingsForm(emptySettingsForm);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function startQRLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setQrStatus(account ? "正在生成新二维码，确认后会替换当前登录状态" : "正在生成二维码");

    try {
      const data = await api<{ login: LoginSession }>("/api/account/qr/start", {
        method: "POST",
        json: {},
      });
      setQrLogin(data.login);
      setQrStatus("二维码已生成，请用微信扫码并在手机上确认");
      void waitForQRConfirm(data.login.session_key);
    } catch (err) {
      setError(toErrorMessage(err));
      setQrStatus("生成二维码失败");
    } finally {
      setBusy(false);
    }
  }

  async function waitForQRConfirm(sessionKey: string) {
    try {
      const result = await api<{ connected: boolean; message: string; account_id?: string }>(
        "/api/account/qr/wait",
        {
          method: "POST",
          json: { session_key: sessionKey },
        },
      );
      setQrStatus(result.message);

      if (result.connected) {
        setQrLogin(null);
        await loadDashboard();
      }
    } catch (err) {
      setQrStatus(toErrorMessage(err));
    }
  }

  async function deleteAccount() {
    if (!account) return;
    if (!window.confirm("确认退出登录吗？已缓存的消息也会一并清除。")) {
      return;
    }

    setBusy(true);
    try {
      await api("/api/account", { method: "DELETE" });
      setNotice("微信登录已退出");
      setQrLogin(null);
      await loadDashboard();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitWebhook(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api("/api/webhooks", {
        method: "POST",
        json: {
          name: webhookForm.name,
          default_to_user_id: "",
          enabled: true,
        },
      });
      setNotice("Webhook 已创建");

      setWebhookForm(emptyWebhookForm);
      await loadDashboard();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteWebhook(webhookID: string) {
    if (!window.confirm("确认删除这个 Webhook 吗？")) {
      return;
    }
    setBusy(true);
    try {
      await api(`/api/webhooks/${encodeURIComponent(webhookID)}`, { method: "DELETE" });
      await loadDashboard();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startWebhookEdit(item: WebhookItem) {
    setEditingWebhookId(item.webhook_id);
    setEditingWebhookName(item.name);
  }

  function cancelWebhookEdit() {
    setEditingWebhookId("");
    setEditingWebhookName("");
  }

  async function saveWebhookEdit(item: WebhookItem) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api(`/api/webhooks/${encodeURIComponent(item.webhook_id)}`, {
        method: "PATCH",
        json: {
          name: editingWebhookName,
          default_to_user_id: "",
          enabled: item.enabled,
        },
      });
      cancelWebhookEdit();
      setNotice("Webhook 已更新");
      await loadDashboard();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleWebhookEnabled(item: WebhookItem) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await api(`/api/webhooks/${encodeURIComponent(item.webhook_id)}`, {
        method: "PATCH",
        json: {
          name: item.name,
          default_to_user_id: "",
          enabled: !item.enabled,
        },
      });
      setNotice(item.enabled ? "Webhook 已停用" : "Webhook 已启用");
      await loadDashboard();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendTestMessage(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await api<{ message_id: string; to_user_id: string }>("/api/messages/send", {
        method: "POST",
        json: {
          text: sendForm.text,
          media_url: sendForm.mediaUrl,
          file_name: sendForm.fileName,
        },
      });
      setNotice("消息已发送");
      await loadDashboard();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string, successText: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successText);
    } catch {
      setError("复制失败，请手动复制");
    }
  }

  function pushToast(tone: ToastTone, text: string) {
    setToasts((current) => [
      ...current,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        tone,
        text,
      },
    ]);
  }

  function removeToast(id: number) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  async function updateAdminAccount(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    if (!settingsForm.currentToken) {
      setBusy(false);
      setError("请输入当前 Token");
      return;
    }
    if (!settingsForm.newToken) {
      setBusy(false);
      setError("请输入新 Token");
      return;
    }
    if (settingsForm.newToken !== settingsForm.confirmToken) {
      setBusy(false);
      setError("两次输入的新 Token 不一致");
      return;
    }

    try {
      const data = await api<{ session: Session }>("/api/auth/account", {
        method: "POST",
        json: {
          current_token: settingsForm.currentToken,
          new_token: settingsForm.newToken,
        },
      });
      setSession(data.session);
      setLoginForm({ token: "" });
      setSettingsForm(emptySettingsForm);
      setNotice("Token 已更新");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const loginState = getLoginState(account);
  const hasSendPayload = Boolean(sendForm.text.trim() || sendForm.mediaUrl.trim());

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 text-sm text-slate-600 shadow-sm">
          <LoaderCircle className="size-4 animate-spin" />
          正在加载控制面板
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.04)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(circle_at_center,black_30%,transparent_85%)]" />
        <Card className="relative z-10 w-full max-w-lg border-slate-200/90 bg-white/90">
          <CardHeader className="space-y-4">
            <CardTitle className="text-4xl tracking-[-0.06em]">微信 Webhook 面板</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleLogin}>
              <div className="space-y-2">
                <Label htmlFor="token">Token</Label>
                <Input
                  id="token"
                  type="password"
                  className={inputClassName}
                  value={loginForm.token}
                  onChange={(event) => setLoginForm({ token: event.target.value })}
                />
              </div>
              <Button className="h-11 w-full rounded-xl" disabled={busy}>
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                进入管理面板
              </Button>
            </form>
          </CardContent>
        </Card>
        <ToastViewport toasts={toasts} onClose={removeToast} />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="self-start lg:sticky lg:top-6">
          <Card className="border-slate-200/90 bg-white/80 shadow-[0_24px_80px_-54px_rgba(15,23,42,0.45)] backdrop-blur">
            <CardHeader className="space-y-4">
              <CardTitle className="text-2xl tracking-[-0.04em] text-slate-950">Webhook Panel</CardTitle>
              <Badge variant={loginState.variant} className="w-fit rounded-full px-3 py-1">
                {loginState.label}
              </Badge>
            </CardHeader>

            <CardContent className="space-y-2">
              {navItems.map((item) => (
                <a
                  key={item.key}
                  href={getHashForView(item.key)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition",
                    activeView === item.key
                      ? "border-emerald-200 bg-emerald-50/80 text-emerald-900 shadow-sm"
                      : "border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <item.icon className={cn("mt-0.5 size-4 shrink-0", activeView === item.key ? "text-emerald-700" : "text-slate-500")} />
                  <div className="text-sm font-semibold">{item.label}</div>
                </a>
              ))}
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex flex-nowrap items-center gap-0.5 overflow-hidden px-0.5">
                  <a
                    href="https://github.com/aristorechina/wxWebHook-core"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 opacity-80 transition hover:opacity-100"
                  >
                    <img
                      src="https://img.shields.io/badge/wxWebHook--core-181716?style=plastic&logo=github&logoColor=white"
                      alt="GitHub wxWebHook-core"
                      className="block h-3"
                    />
                  </a>
                  <a
                    href="https://github.com/aristorechina/wxWebHook-panel"
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 opacity-80 transition hover:opacity-100"
                  >
                    <img
                      src="https://img.shields.io/badge/wxWebHook--panel-181716?style=plastic&logo=github&logoColor=white"
                      alt="GitHub wxWebHook-panel"
                      className="block h-3"
                    />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-6">
          {activeView === "wechat" ? (
            <section className="space-y-4">
              <Card className="border-slate-200/90">
                <CardHeader className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    <Smartphone className="size-4 text-emerald-600" />
                    微信接入
                  </div>
                  <CardTitle>微信登录状态</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {account ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <h3 className="text-lg font-semibold text-slate-950">微信已登录</h3>
                          <p className="text-sm text-slate-500">接入 ID：{account.account_id}</p>
                          <p className="text-sm text-slate-500">扫码微信用户：{account.user_id || "未记录"}</p>
                          <p className="text-sm text-slate-500">最后收消息：{prettyTime(account.last_inbound_at)}</p>
                          {account.last_error ? <p className="text-sm text-orange-700">最近错误：{account.last_error}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="destructive" size="sm" onClick={() => void deleteAccount()} disabled={busy}>
                            <Trash2 className="size-4" />
                            退出登录
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">微信未登录</h3>
                          <form onSubmit={startQRLogin}>
                            <Button className="h-11 rounded-xl" disabled={busy}>
                              <QrCode className="size-4" />
                              生成二维码
                            </Button>
                          </form>
                        </div>
                      </div>

                      {qrLogin ? (
                        <div className="grid items-center gap-5 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-5 md:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)]">
                          <div className="mx-auto w-full max-w-[16rem] rounded-[1.75rem] border border-emerald-100 bg-white p-4 shadow-sm">
                            <QRCodeSVG
                              value={qrLogin.qr_content}
                              size={256}
                              level="M"
                              includeMargin
                              className="block h-auto w-full"
                            />
                          </div>
                          <div className="space-y-3">
                            <h3 className="text-lg font-semibold text-slate-950">请使用微信扫码并确认登录</h3>
                            <div className="rounded-2xl border border-emerald-100 bg-white/80 p-3 text-xs leading-6 text-slate-500">
                              {qrStatus}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeView === "messages" ? (
            <section className="space-y-4">
              <Card className="border-slate-200/90">
                <CardHeader className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    <MessageSquare className="size-4 text-emerald-600" />
                    消息
                  </div>
                  <CardTitle>聊天记录</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!account ? (
                    <EmptyState title="微信未登录" description="先完成微信接入后再查看消息记录。" />
                  ) : messages.length === 0 ? (
                    <EmptyState title="还没有消息" description="收到或发送消息后，这里会显示最近记录。" />
                  ) : (
                    <div
                      ref={messagesScrollRef}
                      className="max-h-[calc(100vh-10rem)] overflow-y-auto rounded-[1.75rem] border border-slate-300 bg-[#ededed] p-3 sm:p-4"
                    >
                      <div className="mx-auto max-w-4xl space-y-2.5">
                        {messages.map((item) => {
                          const isOutbound = item.direction === "outbound";

                          return (
                            <div
                              key={`${item.id}-${item.message_id}-${item.created_at}`}
                              className={cn("flex", isOutbound ? "justify-end" : "justify-start")}
                            >
                              <div
                                className={cn("flex max-w-[82%] flex-col", isOutbound ? "items-end" : "items-start")}
                              >
                                <div
                                  className={cn(
                                    "w-fit max-w-[min(82vw,40rem)] rounded-[0.875rem] px-4 py-2",
                                    isOutbound
                                      ? "bg-[#95ec69] text-slate-900"
                                      : "border border-slate-200 bg-white text-slate-900",
                                  )}
                                >
                                  <MessageBubbleContent item={item} />
                                </div>
                                <div
                                  className={cn(
                                    "mt-1 px-1 text-[0.625rem]",
                                    isOutbound ? "text-right text-slate-600" : "text-left text-slate-500",
                                  )}
                                >
                                  {formatMessageTimestamp(item.created_at)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeView === "webhooks" ? (
            <section className="space-y-4">
              <Card className="border-slate-200/90">
                <CardHeader className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    <Webhook className="size-4 text-emerald-600" />
                    Webhook
                  </div>
                  <CardTitle>创建入口</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <form className="space-y-4" onSubmit={submitWebhook}>
                    <div className="space-y-2">
                      <Label htmlFor="webhook-name">名称</Label>
                      <Input
                        id="webhook-name"
                        className={inputClassName}
                        value={webhookForm.name}
                        onChange={(event) => setWebhookForm((current) => ({ ...current, name: event.target.value }))}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button className="rounded-xl" disabled={busy || !account || !webhookForm.name.trim()}>
                        创建 Webhook
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="border-slate-200/90">
                <CardHeader className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    <BadgeCheck className="size-4 text-emerald-600" />
                    已创建入口
                  </div>
                  <CardTitle>Webhook 列表</CardTitle>
                </CardHeader>
                <CardContent>
                  {webhooks.length === 0 ? (
                    <EmptyState title="还没有 Webhook" description="创建后即可给外部系统提供微信发信入口。" />
                  ) : (
                    <div className="space-y-4">
                      {webhooks.map((item) => (
                        <div key={item.webhook_id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                          <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {editingWebhookId === item.webhook_id ? (
                                <Input
                                  className={cn(inputClassName, "h-9 max-w-xs")}
                                  value={editingWebhookName}
                                  onChange={(event) => setEditingWebhookName(event.target.value)}
                                />
                              ) : (
                                <h3 className="text-base font-semibold text-slate-950">{item.name}</h3>
                              )}
                              <Badge variant={item.enabled ? "success" : "warning"}>
                                {item.enabled ? "启用" : "停用"}
                              </Badge>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                              {publicWebhookURL(item.webhook_id)}
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                              {item.secret}
                            </div>
                            <div className="text-xs leading-6 text-slate-500">最后调用：{prettyTime(item.last_used_at)}</div>
                            <div className="flex flex-wrap gap-2">
                              {editingWebhookId === item.webhook_id ? (
                                <>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => void saveWebhookEdit(item)}
                                    disabled={busy || !editingWebhookName.trim()}
                                  >
                                    保存
                                  </Button>
                                  <Button type="button" variant="ghost" size="sm" onClick={cancelWebhookEdit} disabled={busy}>
                                    取消
                                  </Button>
                                </>
                              ) : (
                                <Button variant="secondary" size="sm" onClick={() => startWebhookEdit(item)} disabled={busy}>
                                  编辑
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void toggleWebhookEnabled(item)}
                                disabled={busy}
                              >
                                {item.enabled ? "停用" : "启用"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void copyText(publicWebhookURL(item.webhook_id), "Webhook 地址已复制")}
                              >
                                复制地址
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void copyText(item.secret, "Webhook 密钥已复制")}
                              >
                                复制密钥
                              </Button>
                              <Button variant="destructive" size="sm" onClick={() => void deleteWebhook(item.webhook_id)}>
                                删除
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeView === "send" ? (
            <section className="space-y-4">
              <Card className="border-slate-200/90">
                <CardHeader className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    <Send className="size-4 text-emerald-600" />
                    测试发送
                  </div>
                  <CardTitle>发送测试消息</CardTitle>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={sendTestMessage}>
                    <div className="space-y-2">
                      <Label htmlFor="message-text">文本内容</Label>
                      <Textarea
                        id="message-text"
                        placeholder="输入要发送的文本内容"
                        value={sendForm.text}
                        onChange={(event) => setSendForm((current) => ({ ...current, text: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="media-url">媒体 URL</Label>
                      <Input
                        id="media-url"
                        className={inputClassName}
                        placeholder="可选，后端会下载后用官方接口上传"
                        value={sendForm.mediaUrl}
                        onChange={(event) => setSendForm((current) => ({ ...current, mediaUrl: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="file-name">文件名</Label>
                      <Input
                        id="file-name"
                        className={inputClassName}
                        placeholder="可选，给文件消息指定名称"
                        value={sendForm.fileName}
                        onChange={(event) => setSendForm((current) => ({ ...current, fileName: event.target.value }))}
                      />
                    </div>
                    <Button className="h-11 w-full rounded-xl" disabled={busy || !account || !hasSendPayload}>
                      <MessageSquareShare className="size-4" />
                      发送测试消息
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeView === "settings" ? (
            <section className="space-y-4">
              <Card className="border-slate-200/90">
                <CardHeader className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    <KeyRound className="size-4 text-emerald-600" />
                    设置
                  </div>
                  <CardTitle>Token 设置</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <form className="space-y-4" onSubmit={updateAdminAccount}>
                    <div className="space-y-2">
                      <Label htmlFor="settings-current-token">当前 Token</Label>
                      <Input
                        id="settings-current-token"
                        type="password"
                        className={inputClassName}
                        value={settingsForm.currentToken}
                        onChange={(event) =>
                          setSettingsForm((current) => ({
                            ...current,
                            currentToken: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="settings-new-token">新 Token</Label>
                      <Input
                        id="settings-new-token"
                        type="password"
                        className={inputClassName}
                        value={settingsForm.newToken}
                        onChange={(event) =>
                          setSettingsForm((current) => ({
                            ...current,
                            newToken: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="settings-confirm-token">确认新 Token</Label>
                      <Input
                        id="settings-confirm-token"
                        type="password"
                        className={inputClassName}
                        value={settingsForm.confirmToken}
                        onChange={(event) =>
                          setSettingsForm((current) => ({
                            ...current,
                            confirmToken: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button className="rounded-xl" disabled={busy}>
                        保存设置
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setSettingsForm(emptySettingsForm)}
                        disabled={busy}
                      >
                        重置
                      </Button>
                    </div>
                  </form>

                  <Separator />

                  <div>
                    <Button
                      variant="destructive"
                      className="h-11 w-full rounded-xl bg-red-600 hover:bg-red-700"
                      onClick={() => void handleLogout()}
                      disabled={busy}
                    >
                      <LogOut className="size-4" />
                      退出管理面板
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </main>
      </div>
      <ToastViewport toasts={toasts} onClose={removeToast} />
    </div>
  );
}

function ToastViewport(props: { toasts: ToastItemData[]; onClose: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3">
      {props.toasts.map((item) => (
        <ToastCard key={item.id} toast={item} onClose={() => props.onClose(item.id)} />
      ))}
    </div>
  );
}

function ToastCard(props: { toast: ToastItemData; onClose: () => void }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    setProgress(100);
    const frame = window.requestAnimationFrame(() => {
      setProgress(0);
    });
    const timer = window.setTimeout(() => {
      props.onClose();
    }, 3000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [props.toast.id]);

  return (
    <div
      className={cn(
        "pointer-events-auto overflow-hidden rounded-2xl border bg-white shadow-[0_24px_80px_-54px_rgba(15,23,42,0.45)]",
        props.toast.tone === "error" ? "border-orange-200" : "border-emerald-200",
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <p
          className={cn(
            "text-sm leading-6",
            props.toast.tone === "error" ? "text-orange-700" : "text-emerald-700",
          )}
        >
          {props.toast.text}
        </p>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="关闭通知"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="h-1 w-full bg-slate-100">
        <div
          className={cn("h-full origin-left transition-[transform] duration-[3000ms] ease-linear", props.toast.tone === "error" ? "bg-orange-500" : "bg-emerald-500")}
          style={{ transform: `scaleX(${progress / 100})` }}
        />
      </div>
    </div>
  );
}

function EmptyState(props: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6">
      <h3 className="text-sm font-semibold text-slate-900">{props.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">{props.description}</p>
    </div>
  );
}

function MessageBubbleContent(props: { item: MessageRecord }) {
  const mediaURL = resolveMessageMediaURL(props.item);

  if (props.item.message_type === "image" && mediaURL) {
    return (
      <div className="space-y-2">
        <img
          src={mediaURL}
          alt={props.item.file_name || "图片"}
          className="block max-h-80 max-w-[min(68vw,22rem)] rounded-[0.625rem] object-contain"
          loading="lazy"
        />
        {props.item.content ? (
          <p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-[1.35rem]">{props.item.content}</p>
        ) : null}
      </div>
    );
  }

  if (props.item.message_type === "video" && mediaURL) {
    return (
      <div className="space-y-2">
        <video
          src={mediaURL}
          controls
          preload="metadata"
          className="block max-h-80 max-w-[min(68vw,22rem)] rounded-[0.625rem] bg-black"
        />
        {props.item.content ? (
          <p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-[1.35rem]">{props.item.content}</p>
        ) : null}
      </div>
    );
  }

  if ((props.item.message_type === "file" || props.item.message_type === "voice") && mediaURL) {
    const label = props.item.file_name || props.item.content || "下载文件";
    return (
      <a
        href={mediaURL}
        target="_blank"
        rel="noreferrer"
        className="block max-w-[min(68vw,22rem)] rounded-[0.625rem] border border-slate-200 bg-white/70 px-3 py-2 text-[0.8125rem] leading-[1.35rem] text-slate-900 underline decoration-slate-300 underline-offset-4"
      >
        {label}
      </a>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-[1.35rem]">
      {props.item.content || getMessageFallback(props.item.message_type)}
    </p>
  );
}

function getLoginState(account: Account | null) {
  if (!account) {
    return {
      variant: "warning" as const,
      label: "未登录",
      note: "当前系统还没有可用的微信登录状态，Webhook 和测试发送都会被阻止。",
    };
  }

  return {
    variant: "success" as const,
    label: "已登录",
    note: "系统已经接入一个微信登录状态，新的扫码登录会直接替换它。",
  };
}

function getMessageFallback(messageType: string) {
  switch (messageType) {
    case "image":
      return "[图片]";
    case "video":
      return "[视频]";
    case "file":
      return "[文件]";
    default:
      return "[消息]";
  }
}

function resolveMessageMediaURL(item: MessageRecord) {
  const value = item.media_url?.trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("/")) {
    return `${API_BASE_URL}${value}`;
  }
  return "";
}

function formatMessageTimestamp(value?: string | null) {
  if (!value) return "";

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const partMap = new Map(parts.map((part) => [part.type, part.value]));
  const year = partMap.get("year") ?? "";
  const month = partMap.get("month") ?? "";
  const day = partMap.get("day") ?? "";
  const hour = partMap.get("hour") ?? "";
  const minute = partMap.get("minute") ?? "";
  const second = partMap.get("second") ?? "";

  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
}

function prettyTime(value?: string | null) {
  if (!value) return "暂无";
  return new Date(value).toLocaleString("zh-CN");
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function getViewFromHash(hash: string): DashboardView {
  const route = normalizeRoute(hash);
  return viewByRoute[route];
}

function getHashForView(view: DashboardView) {
  return `#${routeByView[view]}`;
}

function normalizeRoute(hash: string): DashboardRoute {
  const rawRoute = hash.replace(/^#/, "").trim();
  if (
    rawRoute === "/wechat" ||
    rawRoute === "/messages" ||
    rawRoute === "/webhooks" ||
    rawRoute === "/send" ||
    rawRoute === "/settings"
  ) {
    return rawRoute;
  }
  return defaultRoute;
}

function syncViewFromHash() {
  const route = normalizeRoute(window.location.hash);
  const expectedHash = `#${route}`;
  if (window.location.hash !== expectedHash) {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${expectedHash}`);
  }
  return viewByRoute[route];
}
