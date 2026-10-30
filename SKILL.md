# Skill: 陕西 12345 一键提交/查询

## 何时使用

用户想向陕西省 12345 政务服务便民热线提交诉求（投诉/求助/建议/咨询），或查询已提交诉求的办理进度。

## 能力范围

| 功能 | 状态 | 前置条件 |
|------|:---:|---------|
| 提交诉求（我要留言） | 支持 | 需登录（会话持久化数日复用） |
| 查询进度（进度查询） | 支持 | 需登录（同上） |

平台：`www.shaanxi.gov.cn/sx12345mhwz/website/PC/index`（省政府门户同域 iframe）
认证：陕西省统一身份认证 sfrz.shaanxi.gov.cn（OIDC）

## 快速用法

```bash
cd scripts

# 登录（三重HITL：账号密码+图形码+短信码；建议 --no-headless）
node cli.js login --username 138xxxxxxxx --password xxx --no-headless
# 免密短信登录: node cli.js login --mode sms --phone 138xxxxxxxx --idCard6 后六位 --no-headless

# 提交（默认 dry-run，填表截图不提交）
node cli.js submit --title "标题" --content "反映内容" --address "西安市XX路"
# 真实提交: 追加 --no-dry-run --confirm CONFIRM

# 查询
node cli.js query --code 受理编号
```

## Agent（workbuddy 类）集成协议

1. **无会话**（首次或 `state/shaanxi_session.json` 过期）：先跑 `login --no-headless`，
   脚本终端逐步提示：输密码 → 看截图输图形码 → （可能滑块，人工拖）→ 收短信输码。
   Agent 只需把截图路径告诉用户、把用户输入回传。
2. **提交**：整理诉求为 `--title/--content/--address` → dry-run → 向用户展示截图确认
   → 加 `--no-dry-run --confirm CONFIRM`。
3. **提交成功**：提醒牢记受理编号（后续 `query --code` 凭据）。
4. 报错「尚未登录」→ 回到步骤 1。

## 安全规则

- 真实提交必须双重确认（`--no-dry-run` + `--confirm CONFIRM`），缺一拒绝
- dry-run 截图必须经用户核对后才能真实提交
- 不要替用户编造诉求内容

## 已知限制

- 登录后的留言/查询表单字段需真实账号首次运行实测（脚本自动 dump+截图，config/shaanxi.json 标注）
- 网站改版会使选择器失效；滑块自动尝试失败时需人工拖动（设计内路径）
