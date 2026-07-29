# 妙笔AI

面向中文创作场景的开源 AI 文案助手。访客无需登录即可使用，用户登录后可识别会员权益，站长可在运营后台管理会员、生成记录和服务状态。

[在线演示](https://miaobi-appl-serkon.pages.dev/) · [公开更新日志](https://miaobi-appl-serkon.pages.dev/updates)

> 当前开源版本：V1.4.5  
> 生成服务：DeepSeek V4（只在服务端调用，不在浏览器或小程序中保存 API Key）

## 主要功能

- 43 个中文文案场景，覆盖朋友圈、小红书、短视频、职场、营销等用途。
- 9 个文本工具，支持润色、改写、扩写、总结、校对和风格转换。
- 六种可执行写作风格、输出偏好、处理强度和事实边界检查。
- 免费访客滚动 24 小时 10 次；会员 100 次、长文本、6 个版本和整组导出。
- 用户注册登录、主管理员登录、会员人工开通和操作审计。
- Cloudflare Pages Functions + D1 全栈部署。
- PWA、移动端毛玻璃导航、公开更新日志、隐私与退款说明。
- 原生微信小程序工程，统一请求同一个 HTTPS 后端。

## 项目结构

| 目录 | 用途 |
| --- | --- |
| `app/` | Next/Vinext 页面、API 和运营后台 |
| `lib/` | DeepSeek 接入、会员、写作规则和质量检查 |
| `cloudflare/` | 推荐部署的 Cloudflare Pages + Worker + D1 版本 |
| `wechat-mini-program/` | 可交给微信开发者工具或 WorkBuddy 的原生小程序 |
| `tests/` | 产品规则、Worker、质量和页面回归测试 |
| `scripts/` | 构建、验收和 Cloudflare 一键部署脚本 |

## 本地运行

要求 Node.js 22 或更高版本。

```bash
npm ci
npm run dev
```

完整自检：

```bash
npm run lint
npm test
npm run build:cloudflare
```

## 部署到 Cloudflare Pages

先设置你自己的公开项目名、D1 数据库名和主管理员邮箱：

```bash
export CLOUDFLARE_PAGES_PROJECT="miaobi-ai"
export CLOUDFLARE_D1_DATABASE="miaobi-ai"
export MIAOBI_ADMIN_EMAIL="owner@example.com"
npm run deploy:cloudflare
```

脚本会打开 Cloudflare 官方登录页，然后在终端隐藏输入：

- 全新的 `DEEPSEEK_API_KEY`
- 至少 10 位的 `ADMIN_PASSWORD`

脚本还会自动生成 `SESSION_SECRET` 和部署验收密钥、创建或复用 D1、执行数据库结构、上传 Worker 并进行真实 DeepSeek 验收。

不要把 API Key、管理员密码、Cloudflare 登录令牌或生成的 `wrangler.jsonc` 提交到 GitHub。

## 人工收款

开源版本默认关闭人工收款，并且不包含项目所有者的微信或支付宝收款码。部署者如需启用，应自行确认当地规则，并修改：

- `app/page.tsx` 中的默认付款配置；
- `cloudflare/public/payment-config.js`；
- 本机 `public/payment/` 与 `cloudflare/public/payment/` 下的收款图片。

这些图片路径已加入 `.gitignore`，请勿将个人收款码提交到公共仓库。个人码没有支付回调，不能冒充自动到账、自动开通或自动退款。

## 安全边界

- 浏览器和小程序只请求自己的服务端，绝不直接持有 DeepSeek API Key。
- API 失败或质量检查失败会退还次数。
- 生产环境必须使用独立强密码和新生成的密钥。
- 聊天、Issue、日志和截图中出现过的 Key 应立即撤销。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要公开发布可利用细节。

## WorkBuddy 发布

把整个开源包交给 WorkBuddy，并让它严格执行 [WORKBUDDY_PUBLISH.md](WORKBUDDY_PUBLISH.md)。该说明要求它先跑测试和敏感信息扫描，再创建公开 GitHub 仓库，不得上传个人收款码或密钥。

## 许可证

本项目采用 [MIT License](LICENSE)。你可以学习、修改、分发和商用，但需保留原许可证与版权声明。

AI 生成内容可能存在错误，使用者应自行核对事实、权利和适用规则。
