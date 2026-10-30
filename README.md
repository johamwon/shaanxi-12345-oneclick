# 陕西 12345 一键诉求 Skill

## 这个 Skill 是做什么的

本 Skill 用于帮助用户整理并提交陕西省 12345 政务服务便民热线诉求。它可以根据用户提供的事实和地点信息，协助梳理诉求内容、补充必要表达，并在用户确认后，代替用户完成网页表单中的重复填写操作。同时支持已提交诉求的办理进度查询。

## 它解决什么问题

提交 12345 诉求时，用户通常需要反复处理以下事项：

- 整理零散描述，明确问题发生的时间、地点、对象和具体影响；
- 处理陕西省统一身份认证的三重验证流程（账号密码 + 图形验证码 + 短信验证码）；
- 将诉求内容填写到网页表单的不同字段中；
- 在正式提交前核对填写内容，避免遗漏或误填。

本 Skill 旨在减少这些机械、重复的手工操作，让用户更方便地准备和提交自己的真实诉求。正式提交前，用户应自行核对内容并明确确认。

## 能力一览

| 功能 | 状态 | 前置条件 | 验证码形态 |
|------|:---:|---------|-----------:|
| 提交诉求（我要留言） | ✅ | 需登录（一次登录数日复用） | 图形码+短信码双段 HITL；获取短信可能前置滑块（自动尝试+人工兜底） |
| 查询进度（进度查询） | ✅ | 需登录（同上复用会话） | 无额外验证 |

- **平台**：省政府门户同域 iframe（`www.shaanxi.gov.cn/sx12345mhwz/website/PC/index`）
- **认证**：陕西省统一身份认证（sfrz.shaanxi.gov.cn OIDC）
  - **密码模式**：账号（用户名/手机号/身份证号）+ 密码 + 图形码 + 短信码
  - **免密短信模式**：手机号 + 证件号后六位 + 图形码 + 短信码
- **安全设计**：默认 dry-run（填表不提交），真实提交需 `--no-dry-run --confirm CONFIRM` 双确认

## 环境要求

- Node.js >= 18
- `npm install playwright` 后 `npx playwright install chromium`
- 或使用环境变量 `PW_CHROME_PATH` 指定已有 Chromium

## 快速开始

```bash
cd scripts

# 1. 登录（三重HITL，建议 --no-headless 输验证码）
node cli.js login --username 138xxxxxxxx --password 你的密码 --no-headless
# 免密短信登录（无注册密码时）:
node cli.js login --mode sms --phone 138xxxxxxxx --idCard6 证件后六位 --no-headless

# 2. 提交诉求（默认 dry-run，自动填表并截图）
node cli.js submit --title "路灯故障" --content "XX路与XX路交叉口红绿灯不亮" --address "西安市XX区XX路"
# 核对截图无误后真实提交:
node cli.js submit --title "..." --content "..." --address "..." --no-dry-run --confirm CONFIRM

# 3. 查询办理进度
node cli.js query --code 受理编号
```

## 命令行参数

| 命令 | 参数 |
|------|------|
| login | `--username` 账号 · `--password` 密码 · `--mode sms` 短信免密模式 · `--phone` · `--idCard6` 证件后六位 |
| submit | `--content` 诉求内容（必填） · `--title` 标题 · `--address` 详细地址 · `--district` 区划 · `--no-dry-run` + `--confirm CONFIRM` 真实提交 |
| query | `--code` 受理编号 · `--phone` 手机号 |
| 通用 | `--no-headless` / `--headed` 显示浏览器窗口（输验证码时必需） |

## 使用边界与免责声明

- 本 Skill 仅用于替代用户本人进行正常的网页填写和提交操作。
- 它不涉及任何技术绕过，不规避验证码、身份核验、平台规则或其他安全措施。
- 不得将本 Skill 用于虚假投诉、恶意骚扰、批量提交、冒用他人身份、侵犯他人权益或任何其他非法途径。
- 仅应提交真实、合法、与本人相关的诉求，并对提交内容的真实性、合法性和后果负责。
- 本 Skill 不保证诉求一定被受理、转办或解决，具体结果以相关平台和主管部门的处理为准。

## 版本记录

- v1.0（2026-10-29）：从多省合集 12345-assist-skill 抽取独立；登录链路经视觉模型核验（图形码显示/账号密码填充）；无会话拦截测试通过
