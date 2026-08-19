/**
 * GradWorkbench 剪藏扩展 —— 后台服务
 * ==================================================================
 * 所有网络请求都在这里发起。原因：service worker 不受页面 CORS 约束，
 * 只要 manifest 里声明了 host_permissions，就能直连 localhost 的工作台，
 * 不必依赖服务端返回 CORS 头（服务端的 CORS 是给小书签用的）。
 */

const DEFAULTS = {
  serverUrl: "http://localhost:3000",
  apiKey: "",
  defaultTag: "",
  enrich: true,
  autoBadge: true,
};

/* ------------------------------------------------------------------ */
/* 配置                                                                */
/* ------------------------------------------------------------------ */

async function getConfig() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  // 容错：去掉末尾斜杠
  stored.serverUrl = String(stored.serverUrl || DEFAULTS.serverUrl).replace(
    /\/+$/,
    ""
  );
  return stored;
}

function apiUrl(config, path) {
  return `${config.serverUrl}/api/papers${path}`;
}

function authHeaders(config) {
  const h = { "Content-Type": "application/json" };
  if (config.apiKey) h["X-Api-Key"] = config.apiKey;
  return h;
}

/* ------------------------------------------------------------------ */
/* API 调用                                                            */
/* ------------------------------------------------------------------ */

/** 健康检查 */
async function ping() {
  const config = await getConfig();
  try {
    const res = await fetch(apiUrl(config, "/clip"), {
      headers: authHeaders(config),
    });
    if (!res.ok) {
      return {
        ok: false,
        error:
          res.status === 401
            ? "密钥无效，请在扩展设置中检查"
            : `服务返回 ${res.status}`,
      };
    }
    const data = await res.json();
    return { ok: true, ...data, serverUrl: config.serverUrl };
  } catch (e) {
    return {
      ok: false,
      error: `无法连接 ${config.serverUrl}，请确认工作台已启动`,
    };
  }
}

/** 查重 */
async function checkExists({ doi, title }) {
  const config = await getConfig();
  const params = new URLSearchParams();
  if (doi) params.set("doi", doi);
  if (title) params.set("title", title);
  if (!params.toString()) return { ok: false, exists: false };

  try {
    const res = await fetch(`${apiUrl(config, "/clip")}?${params}`, {
      headers: authHeaders(config),
    });
    if (!res.ok) return { ok: false, exists: false };
    return await res.json();
  } catch (e) {
    return { ok: false, exists: false };
  }
}

/** 入库 */
async function clip(payload) {
  const config = await getConfig();

  const body = {
    ...payload,
    enrich: config.enrich,
  };
  if (config.defaultTag) body.tag = config.defaultTag;

  try {
    const res = await fetch(apiUrl(config, "/clip"), {
      method: "POST",
      headers: authHeaders(config),
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `保存失败（HTTP ${res.status}）`,
      };
    }

    return { ok: true, ...data };
  } catch (e) {
    return {
      ok: false,
      error: `无法连接 ${config.serverUrl}，请确认工作台已启动`,
    };
  }
}

/* ------------------------------------------------------------------ */
/* 通知 & 角标                                                          */
/* ------------------------------------------------------------------ */

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title,
      message,
    });
  } catch (e) {
    /* 通知权限被拒时静默失败 */
  }
}

async function setBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (color) await chrome.action.setBadgeBackgroundColor({ tabId, color });
  } catch (e) {}
}

/** 结果 → 用户可读文案 */
function describeResult(result) {
  if (!result.ok) return { title: "剪藏失败", message: result.error };

  switch (result.status) {
    case "created":
      return {
        title: "已存入文献库",
        message: result.paper?.title?.slice(0, 60) || "保存成功",
      };
    case "updated":
      return {
        title: "已补全元数据",
        message: `${result.message}：${(result.updatedFields || []).join("、")}`,
      };
    case "duplicate":
      return {
        title: "文献已存在",
        message: result.paper?.title?.slice(0, 60) || "库中已有该文献",
      };
    default:
      return { title: "完成", message: result.message || "" };
  }
}

/* ------------------------------------------------------------------ */
/* 消息路由                                                            */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const tabId = sender.tab?.id;

    switch (msg.type) {
      case "PING":
        sendResponse(await ping());
        break;

      case "CHECK":
        sendResponse(await checkExists(msg));
        break;

      case "CLIP": {
        const result = await clip(msg.payload);
        const { title, message } = describeResult(result);

        // 来自 content script 的剪藏才弹通知；popup 自己有 UI 反馈
        if (msg.notify !== false) notify(title, message);

        if (tabId && result.ok) {
          const isNew = result.status === "created";
          await setBadge(
            tabId,
            isNew ? "✓" : "•",
            isNew ? "#16a34a" : "#f59e0b"
          );
          setTimeout(() => setBadge(tabId, ""), 5000);
        }

        sendResponse(result);
        break;
      }

      case "GET_CONFIG":
        sendResponse(await getConfig());
        break;

      case "OPEN_PAPER": {
        const config = await getConfig();
        chrome.tabs.create({
          url: `${config.serverUrl}/papers/${msg.paperId}`,
        });
        sendResponse({ ok: true });
        break;
      }

      case "OPEN_OPTIONS":
        chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: "未知消息类型" });
    }
  })();

  return true; // 保持消息通道开启以支持异步响应
});

/* ------------------------------------------------------------------ */
/* 快捷键                                                              */
/* ------------------------------------------------------------------ */

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "clip-current") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // 让 content script 执行剪藏；没有注入过则临时注入
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "CLIP_NOW" });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/extractor.js"],
      });
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.GWBExtractor?.extract() || null,
      });
      if (result) {
        const r = await clip(result);
        const { title, message } = describeResult(r);
        notify(title, message);
      } else {
        notify("剪藏失败", "当前页面无法解析论文信息");
      }
    } catch (err) {
      notify("剪藏失败", "该页面不允许注入脚本");
    }
  }
});

/* ------------------------------------------------------------------ */
/* 安装引导                                                            */
/* ------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const config = await getConfig();
    // 首次安装打开设置页，让用户确认服务地址
    chrome.tabs.create({
      url: chrome.runtime.getURL("src/options.html?welcome=1"),
    });
    console.log("[GWB] 剪藏扩展已安装，服务地址:", config.serverUrl);
  }
});
