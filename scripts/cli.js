#!/usr/bin/env node
/**
 * 陕西 12345 独立 skill 命令行入口
 *
 * 用法:
 *   node cli.js login  [--username 账号] [--password 密码]              # 三重验证登录（图形码+短信码HITL）
 *                      [--mode sms --phone 手机号 --idCard6 证件后六位]  # 免密短信登录
 *   node cli.js submit --content 诉求内容 [--title 标题] [--address 地址]
 *                      [--district 区划] [--no-dry-run --confirm CONFIRM]
 *   node cli.js query  [--code 受理编号] [--phone 手机号]
 * 通用: --no-headless / --headed 显示浏览器窗口（输验证码时建议）
 */
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
}
// 第一个非 -- 开头参数即命令
const first = process.argv.slice(2).find((x) => !x.startsWith("--"));

const sx = require("./shaanxi");
const headless = !(args.noHeadless || args.headed);

function help() {
  console.log(`陕西 12345 政务热线提交/查询 skill

命令:
  login   登录陕西省统一身份认证（会话持久化，数日复用）
          node cli.js login --username 138xxxxxxxx --password xxx
          node cli.js login --mode sms --phone 138xxxxxxxx --idCard6 后六位
  submit  提交诉求（默认 dry-run，核对截图后 --no-dry-run --confirm CONFIRM）
          node cli.js submit --title "标题" --content "反映内容" --address "西安市XX路"
  query   查询办理进度（登录后）
          node cli.js query --code 受理编号

通用参数:
  --no-headless   显示浏览器窗口（输验证码时必需）
  --headed        同 --no-headless`);
}

(async () => {
  const command = first;
  try {
    if (command === "login") {
      const r = await sx.login({
        username: args.username || args.user, phone: args.phone, password: args.password,
        mode: args.mode || "password", idCard6: args.idCard6,
        imgCaptcha: args.imgCaptcha || args.captcha, smsCode: args.smsCode, headless,
      });
      await r.browser.close();
      console.log("[完成] login ->", r.ok ? (r.reused ? "复用会话" : "新登录成功") : "失败，见截图");
    } else if (command === "submit") {
      if (!args.content) throw new Error("缺少 --content 诉求内容");
      const r = await sx.submitAppeal({
        title: args.title, content: args.content,
        district: args.district, address: args.address,
        dryRun: !args.noDryRun, confirmText: args.confirm, headless,
      });
      if (r.browser) await r.browser.close();
      console.log("[完成] submit ->", r.dryRun ? "DRY-RUN 表单已填充（未提交）" : "已提交" + (r.code ? "，受理编号=" + r.code + "（请牢记）" : ""));
    } else if (command === "query") {
      const r = await sx.queryAppeal({ code: args.code, phone: args.phone, headless });
      console.log("[完成] query -> 详见截图 " + r.shot);
    } else {
      help();
    }
  } catch (e) {
    console.error("[错误] " + e.message);
    process.exit(1);
  }
})();
