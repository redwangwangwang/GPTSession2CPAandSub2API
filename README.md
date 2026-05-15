# GPT Session2CPA and Sub2API

一个本地运行的 ChatGPT session / Codex OAuth 格式转换油猴脚本。

它可以把 ChatGPT Web session JSON 或 Codex OAuth JSON 转换为 `sub2api`、`CPA`、`Cockpit`、`9router` 可导入的 JSON。转换过程只在浏览器本地完成，不上传 token，不写入本地存储。

## 安装油猴脚本

先安装一个用户脚本管理器：

- [Tampermonkey](https://www.tampermonkey.net/)
- [Violentmonkey](https://violentmonkey.github.io/)

然后任选一种方式安装脚本：

- GitHub Raw 安装：[GPTSession2CPAandSub2API.user.js](https://raw.githubusercontent.com/redwangwangwang/GPTSession2CPAandSub2API/main/GPTSession2CPAandSub2API.user.js)
- Greasy Fork：发布后将脚本地址放在这里
- OpenUserJS：发布后将脚本地址放在这里

脚本文件位于：

```text
GPTSession2CPAandSub2API.user.js
```

## 油猴脚本使用方式

1. 在浏览器中登录 [ChatGPT](https://chatgpt.com/)。
2. 打开任意 `https://chatgpt.com/*` 页面。
3. 点击右下角的「Session 转换」按钮。
4. 点击「读取当前登录 session」。
5. 选择导出格式：`sub2api`、`CPA`、`Cockpit` 或 `9router`。
6. 点击「复制输出」或「下载 JSON」。

也可以直接打开：

```text
https://chatgpt.com/api/auth/session
```

脚本会尝试读取当前页面中的 JSON，并自动打开转换面板。

## 支持输入

支持 ChatGPT Web session JSON，例如：

- `user.email`
- `accessToken`
- `sessionToken`
- `expires`
- `account.id`
- `account.planType`

支持 9router Codex OAuth JSON，例如：

- `accessToken`
- `refreshToken`
- `expiresAt`
- `providerSpecificData.chatgptAccountId`
- `providerSpecificData.chatgptPlanType`

支持 Cockpit Tools 导出的 Codex 账号 JSON，例如：

- `tokens.id_token`
- `tokens.access_token`
- `tokens.refresh_token`

工具会尝试从 `accessToken` 的 JWT payload 中补充邮箱、账号 ID、用户 ID、套餐类型和过期时间。

## 输出格式

- `sub2api`：生成 `exported_at / proxies / accounts` 结构，账号平台为 `openai`，类型为 `oauth`。
- `CPA`：生成 Codex CPA auth JSON，包含 `type: "codex"`、`access_token`、`session_token`、`id_token`、邮箱、账号 ID、套餐和过期时间等字段。
- `Cockpit`：生成 Cockpit Tools Codex JSON 可识别的扁平 token 格式，包含 `id_token`、`access_token`、`refresh_token`、`account_id`、`email`、`expired` 等字段。
- `9router`：生成 9router Codex OAuth JSON，包含 `accessToken`、`refreshToken`、`expiresAt`、`providerSpecificData`、`provider`、`authType`、`priority`、`isActive`、`createdAt` 和 `updatedAt` 等字段。

ChatGPT Web session 通常不包含 CPA OAuth 文件中常见的 `refresh_token`，因此 access token 过期后不能自动刷新。

如果输入数据本身没有 OpenAI 签发的真实 `id_token`，工具会根据 access token 中的账号 claims 生成一个随机 RS256 JWT 形状的 `id_token`，用于兼容 CPA / Cockpit 导入。`refresh_token` 无法凭空生成，源数据没有时会保持为空。

## 安全说明

`accessToken`、`sessionToken`、`refreshToken`、`id_token` 都是敏感登录凭证。请只在自己的设备和可信浏览器中使用，不要把输入或输出 JSON 发给别人。

本项目的安全边界：

- 所有解析和转换都在浏览器本地完成。
- 脚本不会把 token 上传到任何服务器。
- 脚本不会把 token 写入 `localStorage`、`sessionStorage` 或远程数据库。
- 点击「复制输出」或「下载 JSON」后，凭证会进入剪贴板或本地文件，请自行妥善保管。

本工具仅用于学习交流、个人备份和格式迁移测试。请遵守 ChatGPT、OpenAI 以及相关中转服务的使用条款。

## 发布到脚本站点

发布到 Greasy Fork、OpenUserJS 等用户脚本站点时，建议使用下面的信息：

```text
脚本名称：GPT Session2CPA and Sub2API
脚本描述：在 ChatGPT 页面本地读取 /api/auth/session，并转换为 sub2api、CPA、Cockpit、9router JSON。
脚本文件：GPTSession2CPAandSub2API.user.js
适用网站：https://chatgpt.com/*, https://chat.openai.com/*
许可证：MIT
主页：https://github.com/redwangwangwang/GPTSession2CPAandSub2API
```

发布前建议检查：

- `@version` 已更新。
- `@downloadURL` 和 `@updateURL` 指向 GitHub raw 文件。
- README 中的 Greasy Fork / OpenUserJS 地址已替换为真实地址。
- 只提交脚本源码，不提交任何真实 session JSON 或导出 token。

## 开发检查

检查用户脚本语法：

```bash
node --check GPTSession2CPAandSub2API.user.js
```

查看 Git 状态：

```bash
git status --short
```

## License

[MIT](LICENSE)
