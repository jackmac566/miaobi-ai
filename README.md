# 妙笔AI

面向中文创作场景的开源 AI 文案助手。访客无需登录即可使用；用户登录后可识别会员权益，站长可在运营后台管理会员、生成记录、人工订单和系统状态。

[在线演示](https://ai-copywriting-assistant.maxc565.chatgpt.site/) · [公开更新日志](https://ai-copywriting-assistant.maxc565.chatgpt.site/updates)

> 当前开源版本：V1.5.0<br>
> 生成服务：DeepSeek V4，仅由服务端调用；API Key 不进入浏览器或小程序源码。

## 主要功能

- 43 个中文文案场景和 9 个文本工具。
- 六种可执行写作风格、输出偏好、处理强度和事实边界检查。
- 免费用户滚动 24 小时 10 次；会员 100 次、长文本、6 个版本和整组导出。
- 用户注册登录、主管理员登录、会员人工开通、退款登记和操作审计。
- Cloudflare Pages Functions、D1、PWA 与移动端毛玻璃导航。
- 全访客可见的更新日志、服务、隐私与退款说明。
- 原生微信小程序工程，与网页共用同一个安全后端。

## 项目结构

| 目录 | 用途 |
| --- | --- |
| `app/` | Next/Vinext 页面、API 和运营后台 |
| `lib/` | DeepSeek 接入、会员、写作规则和质量检查 |
| `cloudflare/` | Cloudflare Pages Functions + D1 版本 |
| `wechat-mini-program/` | 可交给微信开发者工具或 WorkBuddy 的小程序工程 |
| `tests/` | 产品规则、Worker、质量和页面回归测试 |
| `scripts/` | 构建、验收和 Cloudflare 一键部署脚本 |

## 本地运行

要求 Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

完整自检：

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build:cloudflare
node scripts/deploy-cloudflare-pages.mjs --prepare-only --skip-build
```

## 部署到 Cloudflare Pages

先设置你自己的项目名、D1 数据库名和主管理员邮箱：

```bash
export CLOUDFLARE_PAGES_PROJECT="miaobi-ai"
export CLOUDFLARE_D1_DATABASE="miaobi-ai-db"
export MIAOBI_ADMIN_EMAIL="owner@example.com"
npm run deploy:cloudflare
```

macOS 也可双击 `部署Cloudflare Pages.command`。首次部署时，脚本会打开 Cloudflare 官方授权页，并在终端隐藏输入：

- 全新的 `DEEPSEEK_API_KEY`
- 至少 10 位的 `ADMIN_PASSWORD`

脚本还会创建或复用 D1、配置服务端 Secret、上传 Worker，并进行页面、账号、数据库和真实 DeepSeek 验收。普通更新会保留已有的 API Key、管理员密码和会话密钥；只有显式使用 `--rotate-credentials` 才会轮换持久凭据。

## 环境与私有配置

可复制 `.env.example` 了解正式站所需变量。以下内容绝不能提交到 Git：

- DeepSeek API Key、管理员密码、会话密钥与 Cloudflare 令牌；
- `.openai/hosting.json`、`cloudflare/wrangler.jsonc` 和生产数据库 ID；
- 部署日志、验收报告、真实邮箱和个人收款码。

`.openai/hosting.example.json` 只用于让公开源码可构建，不绑定任何真实站点。

## 人工收款

开源版本默认关闭人工收款，不包含项目所有者的微信、支付宝收款码或联系邮箱。部署者如需启用，应自行确认适用规则，并只在私有部署环境中配置：

- `app/page.tsx` 的默认付款配置；
- `cloudflare/public/payment-config.js`；
- `public/payment/` 与 `cloudflare/public/payment/` 下的收款图片。

付款图片路径已加入 `.gitignore`。个人码没有支付回调，不能冒充自动到账、自动开通或自动退款。

## 安全边界

- 浏览器和小程序只请求自己的服务端，绝不直接持有 DeepSeek API Key。
- AI、质量检查或网络失败会退还本次次数。
- 聊天、Issue、日志和截图中出现过的 Key 应立即撤销。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要公开可利用细节。

## WorkBuddy 发布

将整个仓库交给 WorkBuddy，并要求其严格执行 [WORKBUDDY_PUBLISH.md](WORKBUDDY_PUBLISH.md)。它必须先完成测试和敏感信息扫描，再建立公开仓库。

## 许可证

本项目采用 [MIT License](LICENSE)。你可以学习、修改、分发和商用，但必须保留许可证与版权声明。

AI 生成内容可能存在错误，使用者应自行核对事实、权利和适用规则。
