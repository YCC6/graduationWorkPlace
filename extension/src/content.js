/**
 * GradWorkbench 剪藏扩展 —— 页面脚本
 * ==================================================================
 * 职责：
 *  1. 论文详情页右下角注入悬浮剪藏按钮（并显示"已入库"状态）
 *  2. Google Scholar 搜索结果每条旁边注入 "+存库" 小按钮
 *  3. 提供页内 Toast 反馈
 * 实际的网络请求一律转交 background，本脚本不直接 fetch。
 */
(function () {
  "use strict";

  if (window.__GWB_CLIPPER_LOADED__) return;
  window.__GWB_CLIPPER_LOADED__ = true;

  var E = window.GWBExtractor;
  if (!E) {
    console.warn("[GWB] extractor 未加载");
    return;
  }

  /* ================================================================ */
  /* Toast                                                            */
  /* ================================================================ */

  var toastTimer = null;

  function toast(message, kind) {
    var existing = document.querySelector(".gwb-toast");
    if (existing) existing.remove();
    clearTimeout(toastTimer);

    var el = document.createElement("div");
    el.className = "gwb-toast gwb-toast--" + (kind || "info");
    el.innerHTML =
      '<span class="gwb-toast__icon">' +
      (kind === "success" ? "✓" : kind === "error" ? "!" : "•") +
      "</span>" +
      '<span class="gwb-toast__text"></span>';
    el.querySelector(".gwb-toast__text").textContent = message;
    document.body.appendChild(el);

    requestAnimationFrame(function () {
      el.classList.add("gwb-toast--show");
    });

    toastTimer = setTimeout(function () {
      el.classList.remove("gwb-toast--show");
      setTimeout(function () {
        el.remove();
      }, 300);
    }, 3200);

    return el;
  }

  /* ================================================================ */
  /* 与 background 通信                                                */
  /* ================================================================ */

  function send(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (resp) {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || { ok: false, error: "无响应" });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e) });
      }
    });
  }

  /** 统一的剪藏动作：抓取 → 发送 → 反馈 */
  function doClip(data, opts) {
    opts = opts || {};
    var payload = data || E.extract();

    if (!payload || !payload.title) {
      toast("未能识别论文信息，请在详情页重试", "error");
      return Promise.resolve({ ok: false });
    }

    if (opts.onStart) opts.onStart();

    return send({ type: "CLIP", payload: payload, notify: false }).then(
      function (result) {
        if (!result.ok) {
          toast(result.error || "保存失败", "error");
        } else if (result.status === "created") {
          toast("已存入文献库：" + trim(payload.title, 30), "success");
        } else if (result.status === "updated") {
          toast("已补全元数据（" + (result.updatedFields || []).join("、") + "）", "success");
        } else {
          toast("这篇已经在库里了", "info");
        }
        if (opts.onDone) opts.onDone(result);
        return result;
      }
    );
  }

  function trim(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  /* ================================================================ */
  /* 悬浮按钮（论文详情页）                                             */
  /* ================================================================ */

  var fab = null;

  function buildFab() {
    if (fab) return fab;

    fab = document.createElement("div");
    fab.className = "gwb-fab";
    fab.innerHTML =
      '<button class="gwb-fab__main" type="button" title="存入 GradWorkbench 文献库（Alt+S）">' +
      '  <span class="gwb-fab__icon">' +
      '    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>' +
      '      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>' +
      "    </svg>" +
      "  </span>" +
      '  <span class="gwb-fab__label">存入文献库</span>' +
      "</button>" +
      '<button class="gwb-fab__close" type="button" title="本页隐藏">×</button>';

    var mainBtn = fab.querySelector(".gwb-fab__main");
    var labelEl = fab.querySelector(".gwb-fab__label");

    mainBtn.addEventListener("click", function () {
      if (mainBtn.disabled) return;
      mainBtn.disabled = true;
      fab.classList.add("gwb-fab--loading");
      labelEl.textContent = "保存中…";

      doClip(null, {
        onDone: function (result) {
          fab.classList.remove("gwb-fab--loading");
          mainBtn.disabled = false;
          if (result.ok) {
            fab.classList.add("gwb-fab--done");
            labelEl.textContent =
              result.status === "duplicate" ? "已在库中" : "已入库";
            if (result.paper && result.paper.id) {
              mainBtn.title = "点击在工作台中打开";
              mainBtn.onclick = function () {
                send({ type: "OPEN_PAPER", paperId: result.paper.id });
              };
            }
          } else {
            labelEl.textContent = "存入文献库";
          }
        },
      });
    });

    fab.querySelector(".gwb-fab__close").addEventListener("click", function () {
      fab.classList.add("gwb-fab--hidden");
      setTimeout(function () {
        if (fab) fab.remove();
        fab = null;
      }, 250);
    });

    document.body.appendChild(fab);
    requestAnimationFrame(function () {
      fab.classList.add("gwb-fab--show");
    });

    return fab;
  }

  /** 页面已入库时，让按钮直接呈现"已入库"状态 */
  function refreshFabState() {
    if (!fab) return;
    var data = E.extract();
    if (!data.doi && !data.title) return;

    send({ type: "CHECK", doi: data.doi, title: data.title }).then(function (
      resp
    ) {
      if (resp && resp.exists && fab) {
        fab.classList.add("gwb-fab--done");
        var label = fab.querySelector(".gwb-fab__label");
        if (label) label.textContent = "已在库中";
        var mainBtn = fab.querySelector(".gwb-fab__main");
        if (mainBtn && resp.paper) {
          mainBtn.title = "已收录，点击在工作台中打开";
          mainBtn.onclick = function () {
            send({ type: "OPEN_PAPER", paperId: resp.paper.id });
          };
        }
      }
    });
  }

  /* ================================================================ */
  /* Google Scholar 逐条按钮                                           */
  /* ================================================================ */

  function injectScholarButtons() {
    var items = E.extractList();
    if (!items.length) return;

    items.forEach(function (item) {
      var row = item.element;
      if (!row || row.querySelector(".gwb-inline-btn")) return;

      // 挂到 Scholar 每条结果底部的操作栏（.gs_fl），没有就挂在结果末尾
      var bar = row.querySelector(".gs_fl") || row;

      var btn = document.createElement("a");
      btn.className = "gwb-inline-btn";
      btn.href = "javascript:void(0)";
      btn.textContent = "＋ 存入文献库";
      btn.title = item.data.title;

      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.busy === "1") return;
        btn.dataset.busy = "1";
        btn.textContent = "保存中…";

        doClip(item.data, {
          onDone: function (result) {
            btn.dataset.busy = "0";
            if (result.ok) {
              btn.classList.add("gwb-inline-btn--done");
              btn.textContent =
                result.status === "duplicate" ? "✓ 已在库中" : "✓ 已入库";
            } else {
              btn.textContent = "＋ 存入文献库";
            }
          },
        });
      });

      bar.appendChild(btn);
    });
  }

  /* ================================================================ */
  /* 启动                                                              */
  /* ================================================================ */

  function boot() {
    var adapter = E.currentAdapter();
    var isScholar = adapter && adapter.id === "scholar";

    if (isScholar) {
      injectScholarButtons();
      // Scholar 翻页/动态加载后补注入
      var observer = new MutationObserver(debounce(injectScholarButtons, 400));
      var container =
        document.querySelector("#gs_res_ccl_mid") || document.body;
      observer.observe(container, { childList: true, subtree: true });
      return;
    }

    if (E.looksLikePaper()) {
      buildFab();
      refreshFabState();
    }
  }

  function debounce(fn, wait) {
    var t = null;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, wait);
    };
  }

  // 响应快捷键 / popup 的指令
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.type === "CLIP_NOW") {
      doClip();
      sendResponse({ ok: true });
    } else if (msg.type === "EXTRACT") {
      sendResponse({ ok: true, data: E.extract(), list: E.extractList().map(function (i) { return i.data; }) });
    }
    return true;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // 单页应用（如 ScienceDirect）路由变化后重新判断
  var lastHref = location.href;
  setInterval(function () {
    if (location.href !== lastHref) {
      lastHref = location.href;
      setTimeout(boot, 800);
    }
  }, 1000);
})();
