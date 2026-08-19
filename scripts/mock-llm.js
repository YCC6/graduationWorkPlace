/**
 * 本地 mock OpenAI 兼容服务，仅用于验证流式链路，不参与运行时。
 * 用法：node scripts/mock-llm.js [port]
 */
const http = require("http");

const PORT = Number(process.argv[2]) || 4399;

const SAMPLE = `## 一句话总结
生物炭对废水中重金属具有良好吸附能力。

## 研究问题
如何低成本去除废水中的 Pb(II) 与 Cd(II)。

## 研究方法
以农业废弃物在 500°C 热解制备生物炭，开展等温吸附与动力学实验。

## 主要结论
- 最大吸附量 Pb(II) 达 45.2 mg/g
- 符合 Langmuir 等温模型，R² = 0.99

## 创新点
原料成本低，制备工艺简单。

## 局限与存疑
仅做了单一金属体系实验，未考察竞争吸附（推断）。

## 关键术语
**Biochar**（生物炭）：生物质在缺氧条件下热解得到的多孔炭材料。`;

const server = http.createServer((req, res) => {
  if (!req.url.includes("/chat/completions")) {
    res.writeHead(404).end("not found");
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let payload = {};
    try {
      payload = JSON.parse(body);
    } catch {
      /* ignore */
    }

    const userMsg =
      payload.messages?.find((m) => m.role === "user")?.content || "";
    const isPing = userMsg.includes("连通");
    const text = isPing ? "连通" : SAMPLE;

    // 非流式
    if (!payload.stream) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: text } }],
          model: payload.model,
        }),
      );
      return;
    }

    // 流式：按 6 字一块吐出，模拟真实增量
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const chunks = [];
    for (let i = 0; i < text.length; i += 6) chunks.push(text.slice(i, i + 6));

    let i = 0;
    const timer = setInterval(() => {
      if (i >= chunks.length) {
        clearInterval(timer);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }
      res.write(
        `data: ${JSON.stringify({
          choices: [{ delta: { content: chunks[i] } }],
        })}\n\n`,
      );
      i++;
    }, 8);
  });
});

server.listen(PORT, () => {
  console.log(`mock LLM listening on http://127.0.0.1:${PORT}/v1`);
});
