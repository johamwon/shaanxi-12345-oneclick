/**
 * 陕西 12345 提交/查询流程（独立 skill 版）
 * 平台形态：sx12345mhwz（www.shaanxi.gov.cn/sx12345mhwz/website/PC/index）
 *   提交（我要留言）与查询（进度查询）均需登录 —— 与上海同构：
 *   陕西省统一身份认证（sfrz.shaanxi.gov.cn）三重验证：账号+密码+图形码+短信码
 *   图形码获取短信前可能还有滑块（common/slider.js 兜底）。
 * 登录态 storageState 持久化（state/shaanxi_session.json），一次登录数日复用。
 * 另支持手机短信免密登录（--mode sms：手机号+证件号后六位+图形码+短信码）。
 *
 * 2026-10-29 实测：登录页表单字段已抓取；登录后的留言/查询表单需真实账号
 * 首次运行时脚本会自动 dump 表单结构并截图（配合 --confirm 人工核对后填写）。
 */
const { launch, saveSession, hasSession, shot } = require("./common/browser");
const { humanCaptcha, ask } = require("./common/captcha");
const { solveSlider } = require("./common/slider");

const SESSION = "shaanxi";
const PORTAL_MSG = "https://www.shaanxi.gov.cn/sx12345mhwz/website/PC/index";
const LOGIN_RELAY = "https://www.shaanxi.gov.cn/sx12345mhwz/website/PC/caslogin/newlog.html?steptype=two_epoint_1&renew=true&flag=false&client_id=000000103";
const AUTH_HOST = "sfrz.shaanxi.gov.cn";

// 2026-10-29 统一认证页实测选择器
const SEL = {
  account: 'input[placeholder="用户名/手机号码/身份证号"]',
  password: 'input[placeholder="请输入密码"]',
  piccode: 'input[name="piccode"]',
  smscode: 'input[name="smscode"]',
  picImg: "#user_twofactor_code_image",
  smsBtn: ".vericode-btn", // 个人登录的获取验证码按钮（corp/agent为法人）
  loginBtn: 'a:has-text("登录"), button:has-text("登录")',
  confirmBtn: ".layui-layer-btn0", // newlog 中转页"确定"
};

/** 判断当前是否已到统一认证登录页 */
function onAuthPage(url) {
  return url.includes(AUTH_HOST) && url.includes("/sso/login");
}

/** 从门户进入：newlog 中转 → 点确定 → 跳转统一认证 */
async function gotoRelayAndConfirm(page) {
  await page.goto(LOGIN_RELAY, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    const c = document.querySelector(".layui-layer-btn0");
    if (c) c.click();
  });
  await page.waitForTimeout(6000);
  console.log("[跳转] " + (onAuthPage(page.url()) ? "已到统一认证页" : page.url()));
  return onAuthPage(page.url());
}

/** 图形验证码刷新+截图 */
async function refreshPicAndShot(page) {
  await page.evaluate(() => {
    const img = document.querySelector("#user_twofactor_code_image");
    if (img) img.src = "/web/checkcode?v=" + Date.now();
  });
  await page.waitForTimeout(1500);
  return shot(page, "shaanxi_piccode");
}

/**
 * 登录（三重 HITL：图形码 + 短信码；滑块自动尝试+人工兜底）
 * @param {object} d - { username, password, mode: 'password'|'sms', imgCaptcha?, smsCode?, idCard6?, headless }
 */
async function login(d) {
  const existing = hasSession(SESSION);
  const { browser, context, page } = await launch({ sessionName: SESSION, headless: d.headless !== false });
  try {
    const relayOk = await gotoRelayAndConfirm(page);
    if (!relayOk) {
      // 可能已有会话直接跳回平台
      if (page.url().includes("sx12345mhwz")) {
        console.log("[会话] 检测到有效登录态，无需重新登录");
        await saveSession(context, SESSION);
        return { ok: true, reused: true, browser };
      }
      throw new Error("未能到达统一认证页: " + page.url());
    }
    await page.waitForTimeout(2000);
    if (existing) console.log("[登录] 旧会话已过期，重新登录");

    const mode = d.mode === "sms" ? "sms" : "password";
    if (mode === "password") {
      if (!d.username) d.username = await ask("请输入陕西统一认证账号(用户名/手机号/身份证号): ");
      if (!d.password) d.password = await ask("请输入密码(输入时可见): ");
      await page.fill(SEL.account, d.username);
      await page.fill(SEL.password, d.password);
    } else {
      // 手机短信免密登录：切换到手机短信tab
      const tab = await page.$('text=手机短信');
      if (tab) { await tab.click(); await page.waitForTimeout(1500); }
      if (!d.phone) d.phone = await ask("请输入手机号: ");
      if (!d.idCard6) d.idCard6 = await ask("请输入证件号后六位: ");
      await page.fill('input[placeholder*="手机"]', d.phone);
      await page.fill('input[placeholder*="证件"]', d.idCard6);
    }

    // 图形验证码 HITL
    const capShot = await refreshPicAndShot(page);
    const imgCaptcha = d.imgCaptcha || (await humanCaptcha({ page, label: "图形验证码", shotFile: capShot }));
    await page.fill(SEL.piccode, imgCaptcha);

    // 获取短信验证码（可能前置滑块）
    await page.click(SEL.smsBtn);
    const sliderResult = await solveSlider({
      page,
      label: "登录获取短信验证码-滑块",
      isPassed: async (p) =>
        p.evaluate(() => {
          const b = document.querySelector(".vericode-btn");
          return b ? /重新获取|秒后|s后|\d+\s*s/.test(b.innerText) : false;
        }),
      autoTries: 3,
      manualOperable: d.headless !== true,
    });
    if (!sliderResult.ok) {
      if (sliderResult.mode === "headless-blocked") throw new Error("滑块需人工操作，请加 --no-headless 重跑登录");
      throw new Error(sliderResult.error || "登录滑块未完成");
    }
    console.log("[短信] 已请求验证码，请查收");

    const sms = d.smsCode || (await humanCaptcha({ page, label: "短信验证码", shotFile: null }));
    await page.fill(SEL.smscode, sms);
    await page.click(SEL.loginBtn);
    await page.waitForTimeout(6000);

    // 登录成功判定：跳回平台域或认证页消失
    const url = page.url();
    if (url.includes("sx12345mhwz") || !onAuthPage(url)) {
      console.log("[登录] 成功 -> " + url.slice(0, 80));
      await saveSession(context, SESSION);
      return { ok: true, browser, url };
    }
    const errShot = await shot(page, "shaanxi_login_fail");
    throw new Error("登录未跳转成功，请检查验证码/账号。截图: " + errShot);
  } finally {
    if (!global.__KEEP_BROWSER__) await browser.close();
  }
}

/** 会话有效性探测：访问平台首页，若留言仍触发登录跳转则失效 */
async function isLoggedIn(page) {
  await page.goto(PORTAL_MSG, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  // 点击我要留言，观察是否跳登录
  const link = await page.$('a:has-text("我要留言")');
  if (!link) return { ok: false, reason: "未找到留言入口" };
  await link.click().catch(() => {});
  await page.waitForTimeout(5000);
  const url = page.url();
  if (url.includes("newlog") || url.includes(AUTH_HOST)) return { ok: false, reason: "会话已失效，需重新登录" };
  return { ok: true, url };
}

/**
 * 提交诉求（需先 login；dry-run 安全闸门默认开启）
 * @param {object} d - { title?, content, district?, address?, isPublic?, dryRun, confirmText?, headless }
 */
async function submitAppeal(d) {
  if (!hasSession(SESSION)) throw new Error("尚未登录，请先执行 cli.js login");
  const { browser, page } = await launch({ sessionName: SESSION, headless: d.headless !== false });
  try {
    const st = await isLoggedIn(page);
    if (!st.ok) throw new Error(st.reason + "（cli.js login）");

    // 进入留言表单
    await page.goto(PORTAL_MSG, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.click('a:has-text("我要留言")');
    await page.waitForTimeout(5000);
    console.log("[留言表单] " + page.url());

    // 表单结构探测：dump 全部可见输入控件（登录后表单首次实测由真实账号完成）
    const dump = await page.evaluate(() => {
      const els = [...document.querySelectorAll("input, textarea, select")].filter((e) => e.offsetParent !== null && e.type !== "hidden");
      return els.map((e) => ({ tag: e.tagName, type: e.type || "", ph: e.placeholder || "", name: e.name || "" }));
    });
    console.log("[表单字段] " + JSON.stringify(dump));
    const formShot = await shot(page, "shaanxi_form");

    // 已知字段尽力填写（选择器以实测为准，未知字段提示人工）
    if (d.content) {
      const ta = await page.$('textarea');
      if (ta) { await ta.fill(d.content); console.log("[填写] 反映内容"); }
    }
    for (const [key, val] of Object.entries({ district: d.district, address: d.address, title: d.title })) {
      if (!val) continue;
      const el = await page.$(`input[placeholder*="${key === "title" ? "标题" : key === "district" ? "地区" : "地址"}"]`);
      if (el) { await el.fill(val); console.log(`[填写] ${key}`); }
      else console.log(`[提示] ${key} 字段未自动匹配，请对照截图 ${formShot} 人工补填`);
    }

    if (d.dryRun !== false) {
      const s = await shot(page, "shaanxi_filled");
      console.log(
        `\n[安全闸门] dry-run：表单已填充但【未提交】。\n           截图: ${s}\n` +
        `           核对后加 --no-dry-run --confirm CONFIRM 提交。`
      );
      return { ok: true, dryRun: true, shot: s, browser };
    }
    if (d.confirmText !== "CONFIRM") throw new Error("缺少 --confirm CONFIRM，拒绝真实提交");

    // 提交环节验证码形态（图形码/滑块/短信码）在首次真实提交时按表单实际处理：
    // 通用策略——探测提交按钮附近控件并打印，人工按提示完成
    const preShot = await shot(page, "shaanxi_pre_submit");
    console.log(`[提交] 提交前截图: ${preShot}（若出现验证码，请按截图人工输入）`);
    await page.click('button:has-text("提交"), a:has-text("提交"), input[value="提交"]');
    await page.waitForTimeout(6000);
    const finShot = await shot(page, "shaanxi_finish");
    const body = await page.evaluate(() => document.body.innerText);
    const codeMatch = body.match(/(受理编号|工单号|查询码)[：:\s]*([A-Za-z0-9-]{6,})/);
    console.log(`[结果] ${finShot}\n${codeMatch ? "受理编号: " + codeMatch[2] + "（请牢记，用于查询）" : body.slice(0, 300)}`);
    return { ok: true, dryRun: false, shot: finShot, code: codeMatch ? codeMatch[2] : null, browser };
  } finally {
    await browser.close();
  }
}

/**
 * 进度查询（需先登录）
 * @param {object} d - { code?, phone?, headless }
 */
async function queryAppeal(d) {
  if (!hasSession(SESSION)) throw new Error("尚未登录，请先执行 cli.js login");
  const { browser, page } = await launch({ sessionName: SESSION, headless: d.headless !== false });
  try {
    await page.goto(PORTAL_MSG, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.click('a:has-text("进度查询")');
    await page.waitForTimeout(5000);
    console.log("[查询页] " + page.url());
    const dump = await page.evaluate(() => {
      const els = [...document.querySelectorAll("input, select")].filter((e) => e.offsetParent !== null && e.type !== "hidden");
      return els.map((e) => ({ tag: e.tagName, type: e.type || "", ph: e.placeholder || "", name: e.name || "" }));
    });
    console.log("[查询字段] " + JSON.stringify(dump));
    if (d.code) {
      const el = await page.$('input[placeholder*="编号"], input[placeholder*="工单"], input[placeholder*="码"]');
      if (el) { await el.fill(d.code); console.log("[填写] 受理编号"); }
    }
    const qShot = await shot(page, "shaanxi_query_form");
    console.log("[提示] 查询表单截图: " + qShot + "（字段以实测为准，首次运行请人工核对后补齐 --code/--phone）");
    return { ok: true, shot: qShot, browser };
  } finally {
    await browser.close();
  }
}

module.exports = { login, submitAppeal, queryAppeal, isLoggedIn, PORTAL_MSG, LOGIN_RELAY };
