"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  PlugZap,
  Save,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";

interface Preset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  hint: string;
}

export default function AiSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [provider, setProvider] = useState("deepseek");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [configured, setConfigured] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyMasked, setApiKeyMasked] = useState("");
  const [testResult, setTestResult] = useState<
    { ok: boolean; text: string } | null
  >(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai/settings");
        const data = await res.json();
        setPresets(data.presets || []);
        setConfigured(!!data.configured);
        setHasApiKey(!!data.hasApiKey);
        setApiKeyMasked(data.apiKeyMasked || "");
        setProvider(data.provider || "deepseek");
        setBaseUrl(data.baseUrl || "");
        setModel(data.model || "");
        // 首次进入且没配过：带上推荐预设的默认值，少填两个框
        if (!data.baseUrl && data.presets?.length) {
          const p = data.presets[0];
          setProvider(p.id);
          setBaseUrl(p.baseUrl);
          setModel(p.model);
        }
      } catch {
        toast.error("读取 AI 配置失败");
      }
      setLoading(false);
    })();
  }, []);

  const applyPreset = (id: string) => {
    setProvider(id);
    const p = presets.find((x) => x.id === id);
    if (p && p.id !== "custom") {
      setBaseUrl(p.baseUrl);
      setModel(p.model);
    }
    setTestResult(null);
  };

  const save = async () => {
    if (!baseUrl.trim() || !model.trim()) {
      toast.error("服务地址与模型名称不能为空");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // 传空字符串表示"沿用已存的 Key"，不会把它清掉
        body: JSON.stringify({ provider, baseUrl, model, apiKey }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("配置已保存");
        setConfigured(!!data.configured);
        if (apiKey.trim()) {
          setHasApiKey(true);
          setApiKeyMasked(
            apiKey.length > 8
              ? `${apiKey.slice(0, 3)}******${apiKey.slice(-4)}`
              : "****",
          );
          setApiKey("");
        }
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch {
      toast.error("保存失败");
    }
    setSaving(false);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, baseUrl, model, apiKey }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          text: `连接正常，耗时 ${data.latencyMs}ms，模型回复「${data.reply}」`,
        });
      } else {
        setTestResult({ ok: false, text: data.error || "连接失败" });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        text: (err as Error).message || "无法访问模型服务",
      });
    }
    setTesting(false);
  };

  const currentPreset = presets.find((p) => p.id === provider);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">AI 模型</h2>
        {!loading &&
          (configured ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] font-medium">
              <CheckCircle2 className="h-3 w-3" />
              已配置
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium">
              <AlertCircle className="h-3 w-3" />
              未配置
            </span>
          ))}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        配置后即可在 PDF 预览区使用「AI 总结」与「翻译」。支持任何 OpenAI
        兼容接口，结果会缓存在本地库里，同一篇文献不会重复计费。
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* 服务商预设 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">服务商</label>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  title={p.hint}
                  className={`px-2.5 h-7 rounded-md border text-xs transition-colors ${
                    provider === p.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {currentPreset && (
              <p className="text-[11px] text-muted-foreground">
                {currentPreset.hint}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">服务地址 (Base URL)</label>
              <input
                value={baseUrl}
                onChange={(e) => {
                  setBaseUrl(e.target.value);
                  setTestResult(null);
                }}
                placeholder="https://api.deepseek.com/v1"
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">模型名称</label>
              <input
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  setTestResult(null);
                }}
                placeholder="deepseek-chat"
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              API Key
              {hasApiKey && (
                <span className="ml-2 font-normal text-muted-foreground">
                  当前：{apiKeyMasked}（留空则不修改）
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder={hasApiKey ? "留空表示沿用已保存的密钥" : "sk-..."}
                autoComplete="off"
                className="w-full h-9 pl-3 pr-9 rounded-lg border border-input bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              >
                {showKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              密钥保存在本机 SQLite 数据库中，不会上传到任何第三方。导出备份时请注意保管备份文件。
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存配置
            </button>
            <button
              onClick={test}
              disabled={testing || !baseUrl || !model}
              className="inline-flex items-center gap-1.5 px-4 h-9 rounded-lg border text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlugZap className="h-4 w-4" />
              )}
              测试连接
            </button>
          </div>

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-lg p-3 text-xs leading-relaxed ${
                testResult.ok
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span className="break-all">{testResult.text}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
