/**
 * 12345-assist-skill · 通用滑块验证模块（vue slide-verify 拼图缺口型）
 *
 * 策略（2026-10-27 云南实测形成）：
 *  1. 自动尝试：canvas 模板匹配定位缺口（block 拼图图案源自背景缺口处截取，
 *     对背景逐位置做零均值 SAD，最小处即缺口） + dispatchEvent 派发带时间间隔的
 *     mousedown/mousemove/mouseup 人类轨迹（真实 mouse API 在此类组件上事件
 *     会被吞，dispatch 到 document 才触发 Vue 监听）。
 *     注意鼠标位移→拼图位移存在 ~0.93 比例映射，已做补偿。
 *  2. 自动失败（定位存在 ±15px 级误差、叠加比例漂移，不保证一次通过）→
 *     降级人工：headless=false 弹出有头浏览器，用户手动拖滑块（几秒），
 *     脚本轮询等待滑块通过（弹窗消失或目标按钮进入倒计时态）。
 *  3. HITL 标记对 Agent 集成友好：输出 [HITL] 前缀 + 截图路径。
 *
 * 通过判定由调用方传入 judge() 函数（各平台“通过”的表现不同）。
 */

/** 页面内执行：模板匹配定位缺口中心与拼图案初始中心 */
async function analyzeSlider(page) {
  return page.evaluate(() => {
    const bgCanvas = document.querySelector(".slide-verify canvas:not(.slide-verify-block)");
    const blockCanvas = document.querySelector("canvas.slide-verify-block");
    if (!bgCanvas || !blockCanvas) return { error: "滑块canvas未找到" };
    const W = bgCanvas.width, H = bgCanvas.height;
    let gdata;
    try {
      gdata = bgCanvas.getContext("2d").getImageData(0, 0, W, H).data;
    } catch (e) {
      return { error: "背景canvas跨域: " + e.message };
    }
    const bw = blockCanvas.width, bh = blockCanvas.height;
    const bdata = blockCanvas.getContext("2d").getImageData(0, 0, bw, bh).data;
    // 拼图案（非透明像素）的边界与中心偏移
    let pxMin = bw, pxMax = 0, pyMin = bh, pyMax = 0;
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++)
        if (bdata[(y * bw + x) * 4 + 3] > 40) {
          if (x < pxMin) pxMin = x;
          if (x > pxMax) pxMax = x;
          if (y < pyMin) pyMin = y;
          if (y > pyMax) pyMax = y;
        }
    const patternCenter = Math.round((pxMin + pxMax) / 2);
    // 模板匹配：零均值 SAD（消除缺口遮罩整体变暗的影响），步长2加速
    let best = null;
    for (let gx = 70; gx + (pxMax - pxMin) <= W; gx += 2) {
      const pairs = [];
      let bSum = 0, gSum = 0;
      for (let y = pyMin; y <= pyMax; y += 2)
        for (let x = pxMin; x <= pxMax; x += 2) {
          const bi = (y * bw + x) * 4;
          if (bdata[bi + 3] < 40) continue;
          const gi = (y * W + gx + (x - pxMin)) * 4;
          const b = (bdata[bi] + bdata[bi + 1] + bdata[bi + 2]) / 3;
          const g = (gdata[gi] + gdata[gi + 1] + gdata[gi + 2]) / 3;
          pairs.push([b, g]);
          bSum += b;
          gSum += g;
        }
      const n = pairs.length || 1;
      let sad = 0;
      const bMean = bSum / n, gMean = gSum / n;
      for (const [b, g] of pairs) sad += Math.abs(b - bMean - (g - gMean));
      const score = sad / n;
      if (!best || score < best.score) best = { x: gx, score };
    }
    return {
      canvasW: W,
      gapCenter: best ? best.x + patternCenter : null, // 缺口中心（canvas坐标）
      patternCenter,
      score: best ? Math.round(best.score * 10) / 10 : null,
    };
  });
}

/**
 * 滑块拖动（纯 Playwright mouse API + 0.93 位移比例补偿 + 人类轨迹）
 * 2026-10-27 实测：
 *  - 真实 mouse 事件有效（早前误判：mouse.down 后未发生 move 时拼图自然不动）
 *  - dispatchEvent 方案会让页面 JS 挂起，弃用
 *  - 鼠标位移→拼图位移映射 ≈0.93（多组实测：72→67, 123→114, 164→152）
 */
async function dragSlider(page, dxBlock) {
  const dxMouse = Math.round(dxBlock / 0.93); // 比例补偿
  console.log(`[滑块-拖动] dxBlock=${dxBlock} dxMouse=${dxMouse} 定位按钮...`);
  const box = await page.locator(".slide-verify-slider-mask-item").boundingBox();
  if (!box) return { error: "滑块按钮未找到" };
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  console.log(`[滑块-拖动] 按钮(${Math.round(startX)},${Math.round(startY)}) 按下...`);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(150);
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = t < 0.7 ? (t / 0.7) * 0.84 : 0.84 + ((t - 0.7) / 0.3) * 0.16; // 先快后缓停
    await page.mouse.move(startX + dxMouse * eased, startY + (Math.random() * 2 - 1), { steps: 1 });
    await page.waitForTimeout(45 + Math.random() * 40);
  }
  console.log(`[滑块-拖动] 移动完成，mouseup...`);
  await page.mouse.move(startX + dxMouse, startY);
  await page.waitForTimeout(150);
  await page.mouse.up();
  console.log(`[滑块-拖动] 完成`);
  return { done: true, dxMouse, dxBlock };
}

/**
 * 滑块完整处理：自动尝试N次 → 失败降级人工（需 headed 浏览器）
 * @param {object} p
 * @param {import('playwright').Page} p.page
 * @param {string} p.label - 展示名（如「获取短信验证码-滑块」）
 * @param {Function} p.isPassed - async () => boolean，平台特定的通过判定
 * @param {number} p.autoTries - 自动尝试次数，默认 2
 * @param {Function} p.humanPrompt - async (msg) => void，人工提示回调（可输出HITL标记）
 */
async function solveSlider({ page, label = "滑块验证", isPassed, autoTries = 2, humanPrompt = null, waitSec = 300, manualOperable = false }) {
  // 等滑块弹出
  const appeared = await page
    .waitForSelector(".slide-verify", { state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return { ok: true, mode: "no-slider" }; // 没弹滑块，无需处理

  // ---- 自动尝试 ----
  const GAP_OFFSET = -12; // 2026-10-27 视觉交叉验证：模板匹配结果系统性偏右约1/4缺口宽（≈12px）
  const withTimeout = (fn, ms, fallback) =>
    Promise.race([Promise.resolve().then(fn), new Promise((r) => setTimeout(() => r(fallback), ms))]);
  for (let i = 1; i <= autoTries; i++) {
    const info = await withTimeout(() => analyzeSlider(page), 8000, { error: "分析超时" });
    if (info.error || info.gapCenter == null) {
      console.log(`[滑块] 第${i}次定位失败: ${info.error || "缺口未识别"}`);
      continue;
    }
    console.log(`[滑块] 第${i}次自动尝试: 缺口中心=${info.gapCenter} 拼图初始中心=${info.patternCenter} (匹配分=${info.score})`);
    const dx = info.gapCenter + GAP_OFFSET - info.patternCenter;
    if (dx <= 0) continue;
    await dragSlider(page, dx);
    // 拖动后页面可能因验证失败进入重置动画（JS繁忙，evaluate会排队），判定加超时保护
    await page.waitForTimeout(2500);
    const passed = await withTimeout(() => isPassed(page), 6000, false);
    if (passed) {
      console.log(`[滑块] 自动通过（第${i}次）`);
      return { ok: true, mode: "auto", tries: i };
    }
    // 失败后组件会重置并刷新新滑块，等它稳定
    await page.waitForTimeout(1200);
    console.log(`[滑块] 第${i}次未通过，${i < autoTries ? "重试" : "转入人工"}`);
  }

  // ---- 人工降级 ----
  // headless 模式下用户无法操作浏览器窗口：直接给出明确指引而非傻等
  if (!manualOperable) {
    const shotFile = await require("./browser").shot(page, "slider_blocked");
    console.log(
      `\n[HITL] 需要人工完成「${label}」滑块验证，但当前为无头模式（headless）无法人工操作。\n` +
      `  截图: ${shotFile}\n` +
      `  解决：请加 --no-headless（或 --headed）参数重新运行本命令，浏览器窗口弹出后\n` +
      `  脚本会自动完成到滑块步骤，您只需拖动滑块对准缺口（几秒），之后流程自动继续。`
    );
    return { ok: false, mode: "headless-blocked", error: "滑块需人工操作，请加 --no-headless 重跑" };
  }
  const shotFile = await require("./browser").shot(page, "slider_manual");
  const msg =
    `\n[HITL] 需要人工完成「${label}」滑块验证\n` +
    `  请在浏览器窗口中手动拖动滑块对准缺口（几秒即可）。\n` +
    `  当前状态截图: ${shotFile}\n` +
    `  脚本将自动等待您完成（最长${Math.round(waitSec / 60)}分钟）...`;
  console.log(msg);
  if (humanPrompt) await humanPrompt(msg, shotFile);

  // 轮询等待人工完成
  const pollCount = Math.max(1, Math.round(waitSec / 3));
  for (let i = 0; i < pollCount; i++) {
    await page.waitForTimeout(3000);
    if (await isPassed()) {
      console.log("[滑块] 人工已完成，继续流程");
      return { ok: true, mode: "manual" };
    }
  }
  return { ok: false, mode: "timeout", error: `等待人工完成滑块超时（${waitSec}s）` };
}

module.exports = { solveSlider, analyzeSlider, dragSlider };
