# 给 WorkBuddy 的 GitHub 开源发布任务

请把本目录作为一个全新的公开 GitHub 仓库发布。

## 仓库设置

- 建议仓库名：`miaobi-ai`
- 可见性：Public
- 默认分支：`main`
- 简介：`开源中文 AI 文案助手：DeepSeek + Cloudflare Pages + D1 + 会员后台`
- Topics：`deepseek`、`cloudflare-pages`、`cloudflare-d1`、`ai-writing`、`chinese`、`pwa`
- 许可证：保留现有 MIT License
- 开启 Issues；若账号支持，可开启 Discussions

## 发布前必须完成

1. 不复制旧 Git 历史、内部远程地址或真实 `.openai/hosting.json`。
2. 确认不存在真实 API Key、Cloudflare 令牌、账号 ID、生产 D1 ID、管理员密码、个人收款码、私人邮箱、部署日志和验收报告。
3. 运行：

```bash
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build:cloudflare
node scripts/deploy-cloudflare-pages.mjs --prepare-only --skip-build
```

4. 确认 README、LICENSE、SECURITY、CONTRIBUTING 和 CHANGELOG 可从 GitHub 首页打开。
5. 确认 GitHub Actions 首次运行通过。

## Git 操作

新建公开仓库后，以以下信息创建首次提交：

```text
feat: open-source 妙笔AI V1.5.0
```

不得把本机生成文件补进提交，即使 Git 显示它们未跟踪。

## 完成后返回

- GitHub 仓库公开链接；
- 首次提交 SHA；
- Actions 测试链接与结论；
- 实际公开文件清单；
- 再次确认没有上传任何密钥、密码、个人收款码或生产数据库标识。

除非项目所有者另行明确授权，不要修改线上 Cloudflare 项目或删除现有部署。
