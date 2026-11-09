import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "隐私政策｜妙笔AI",
  description: "妙笔AI 隐私政策：收集哪些数据、数据去向、第三方共享、保留期限、注销方式与你的权利。",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

const sections: Array<[string, string]> = [
  ["一、我们处理哪些信息", "为提供文案生成、额度与会员识别服务，本站在服务端处理：你用于登录的账号邮箱与昵称（由你登录的平台提供）；你提交的创作主题、素材、受众、目的与要求；为你生成的文案内容与生成记录；以及用于 24 小时滚动额度的匿名使用标识。除你主动提交的内容外，本站不会读取你的通讯录、位置、相册或其他设备信息。"],
  ["二、信息如何使用", "以上信息仅用于：调用 DeepSeek 完成生成与文本处理、执行免费/会员额度规则、保存你的生成历史、维护会员权益与退款记录、进行安全防护（登录限流、滥用识别）和运营统计。我们不会用你的创作内容对你进行画像，也不会用于广告投放。"],
  ["三、第三方共享：DeepSeek", "生成时，你提交的主题、素材、受众和要求会通过服务端发送给 DeepSeek（杭州深度求索人工智能基础技术研究有限公司）以完成内容生成。DeepSeek API Key 只保存在服务端秘密环境或加密存储中，不会进入网页代码。除 DeepSeek 与为你提供网络服务的基础设施（Cloudflare 等）外，我们不向任何第三方出售或共享你的个人数据。"],
  ["四、AI 生成内容标识", "依据《人工智能生成合成内容标识办法》，本站在生成结果旁显式标注“AI 生成”。导出或复制的内容请自行保留该标识或注明来源；AI 生成内容可能存在错误、遗漏或不适合特定平台的内容，发布前必须由你本人核对。"],
  ["五、数据存储与保留期限", "数据存储于 Cloudflare 平台（境外）。生成记录与账号数据会保留至你主动注销；注销后即刻删除生成记录、额度记录与账号信息。为满足财务凭证与争议处理要求，涉及人工收款的订单记录可能继续保留；站长审计日志作为运营记录由站长管理。匿名访客额度标识按滚动 24 小时窗口覆盖。"],
  ["六、注销账号与删除数据", "你可以随时在“我的账号”中选择“注销账号与删除我的数据”。注销将删除你的生成记录、额度记录、会员权益与站内账号信息，且不可恢复；你在第三方登录平台（如 ChatGPT）的账号不受影响。站长账号不能自行注销，需先在运营后台更换站长邮箱。"],
  ["七、你的其他权利", "你可随时导出、复制你的生成内容（页面内已提供导出与复制功能）；如需要更正、导出或删除其他个人数据，请通过站点公布的联系方式联系站长，我们会在核实身份后 15 个工作日内处理。"],
  ["八、未成年人保护", "本服务面向具有完全民事行为能力的用户。未满 14 周岁的儿童不应单独注册使用本服务；监护人如发现儿童信息被处理，请联系站长删除。"],
  ["九、政策更新与联系方式", "本政策更新时会同步更新页面顶部的日期，重大变更会在更新日志中说明。联系站长：请使用站点中公布的联系方式；请勿在联系内容中发送 API Key、密码、验证码或其他敏感凭据。"],
];

export default function PrivacyPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">跳到隐私政策正文</a>
      <main className="legal-page-shell" id="main-content">
        <header>
          <Link href="/"><span className="brand-mark">✎</span><b>妙笔AI</b></Link>
          <Link href="/">返回创作台 →</Link>
        </header>
        <section className="legal-page-hero">
          <span>PRIVACY POLICY · 全访客可见</span>
          <h1>隐私政策</h1>
          <p>说清楚收集什么、用在哪里、如何删除。</p>
          <time dateTime="2026-11-06">更新日期：2026 年 11 月 6 日</time>
        </section>
        <section className="legal-page-grid" aria-label="隐私政策正文">
          {sections.map(([title, content]) => (
            <article key={title}>
              <h2>{title}</h2>
              <p>{content}</p>
            </article>
          ))}
        </section>
        <footer className="legal-links">
          <Link href="/terms">用户协议</Link>
          <Link href="/legal">服务、隐私与退款说明</Link>
          <Link href="/updates">更新日志</Link>
        </footer>
      </main>
    </>
  );
}
