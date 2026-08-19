/**
 * GradWorkbench 剪藏扩展 —— 设置页
 */

const DEFAULTS = {
  serverUrl: "http://localhost:3000",
  apiKey: "",
  defaultTag: "",
  enrich: true,
  autoBadge: true,
};

const $ = (id) => document.getElementById(id);

const inputs = {
  serverUrl: $("serverUrl"),
  apiKey: $("apiKey"),
  defaultTag: $("defaultTag"),
  enrich: $("enrich"),
  autoBadge: $("autoBadge"),
};

/* ------------------------------------------------------------------ */
/* 载入 / 保存                                                          */
/* ------------------------------------------------------------------ */

async function load() {
  const cfg = await chrome.storage.sync.get(DEFAULTS);
  inputs.serverUrl.value = cfg.serverUrl;
  inputs.apiKey.value = cfg.apiKey;
  inputs.defaultTag.value = cfg.defaultTag;
  inputs.enrich.checked = Boolean(cfg.enrich);
  inputs.autoBadge.checked = Boolean(cfg.autoBadge);
}

function normalizeUrl(raw) {
  let url = String(raw || "").trim().replace(/\/+$/, "");
  if (!url) return DEFAULTS.serverUrl;
  if (!/^https?:\/\//i.test(url)) url = "http://" + url;
  return url;
}

async function save() {
  const cfg = {
    serverUrl: normalizeUrl(inputs.serverUrl.value),
    apiKey: inputs.apiKey.value.trim(),
    defaultTag: inputs.defaultTag.value.trim(),
    enrich: inputs.enrich.checked,
    autoBadge: inputs.autoBadge.checked,
  };

  inputs.serverUrl.value = cfg.serverUrl;
  await chrome.storage.sync.set(cfg);

  // 非 localhost 地址需要额外申请主机权限
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(cfg.serverUrl)) {
    try {
      const origin = new URL(cfg.serverUrl).origin + "/*";
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        setResult(
          $("save-result"),
          "已保存，但未获得该地址的访问权限，剪藏可能失败",
          "err"
        );
        return;
      }
    } catch (e) {
      /* URL 非法时忽略，测试连接会报错 */
    }
  }

  setResult($("save-result"), "已保存", "ok");
}

/* ------------------------------------------------------------------ */
/* 测试连接                                                            */
/* ------------------------------------------------------------------ */

async function test() {
  const box = $("test-result");
  setResult(box, "连接中…", "");

  const url = normalizeUrl(inputs.serverUrl.value);
  const key = inputs.apiKey.value.trim();

  // 先确保有权限，否则 fetch 会直接被拦
  try {
    const origin = new URL(url).origin + "/*";
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (!has) {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) {
        setResult(box, "未授权访问该地址", "err");
        return;
      }
    }
  } catch (e) {
    setResult(box, "地址格式不正确", "err");
    return;
  }

  try {
    const headers = {};
    if (key) headers["X-Api-Key"] = key;

    const res = await fetch(`${url}/api/papers/clip`, { headers });

    if (res.status === 401) {
      setResult(box, "密钥不正确", "err");
      return;
    }
    if (!res.ok) {
      setResult(box, `服务返回 ${res.status}`, "err");
      return;
    }

    const data = await res.json();
    const authNote = data.authRequired
      ? "（服务端已启用密钥校验）"
      : "";
    setResult(
      box,
      `连接成功 · 文献库现有 ${data.paperCount ?? 0} 篇 ${authNote}`,
      "ok"
    );
  } catch (e) {
    setResult(box, "连不上，请确认工作台已启动", "err");
  }
}

function setResult(el, text, kind) {
  el.textContent = text;
  el.className = "result" + (kind ? ` result--${kind}` : "");
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

$("btn-save").addEventListener("click", save);
$("btn-test").addEventListener("click", test);

// 回车即测试
inputs.serverUrl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") test();
});

if (new URLSearchParams(location.search).get("welcome")) {
  $("welcome").classList.remove("hidden");
}

load();
