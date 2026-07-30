import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "服务、隐私与退款说明｜妙笔AI",
  description: "查看妙笔AI的服务范围、会员权益、数据处理、人工收款和退款处理规则。",
  alternates: { canonical: "/legal" },
  robots: { index: true, follow: true },
};

const sections = [
  ["服务范围", "妙笔AI提供文案生成、改写与结构化写作辅助。DeepSeek 输出可能存在错误、遗漏或不适合特定平台的内容，发布前必须由用户自行核对；不得用于违法、欺诈、侵权或虚假宣传。"],
  ["会员权益", "免费访客每个滚动 24 小时可使用 10 次、单次 3 个版本；会员每 24 小时 100 次，并开放 6 个版本、长文输入、高级控制和整组导出。两个等级都通过服务端调用 DeepSeek；接口故障或结果未通过质量检查时不扣次数。"],
  ["数据与隐私", "本站会处理匿名额度标识、账号邮箱、所选场景和生成记录，以提供额度、历史与运营统计；生成时，用户提交的主题、素材、受众和要求会发送给 DeepSeek。API Key 只保存在服务端秘密环境或加密存储中，不会进入网页或小程序代码。"],
  ["人工收款与开通", "微信、支付宝个人码没有自动支付回调。付款前应确认套餐并保留支付记录，站长核对金额、付款时间和登录邮箱后在运营后台人工开通；不要只凭截图认定到账。"],
  ["退款处理", "重复付款、金额错误或付款后未开通权益，可核对到账记录后原路退款；已开通并使用的服务，按未使用天数或未消费权益协商处理。退款与开通均保留操作记录。"],
  ["联系站长", "请通过部署方在站点中公布的联系方式联系站长。请勿发送 API Key、银行卡密码、验证码或其他敏感凭据。"],
] as const;

export default function LegalPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">跳到服务说明</a>
      <main className="legal-page-shell" id="main-content">
        <header>
          <Link href="/"><span className="brand-mark">✎</span><b>妙笔AI</b></Link>
          <Link href="/">返回创作台 →</Link>
        </header>
        <section className="legal-page-hero">
          <span>TRUST CENTER · 全访客可见</span>
          <h1>服务、隐私<br/>与退款说明</h1>
          <p>把服务边界、数据去向和人工收款规则写清楚，付款前后都有可核对依据。</p>
          <time dateTime="2026-07-29">更新日期：2026 年 7 月 29 日</time>
        </section>
        <section className="legal-page-grid" aria-label="服务条款内容">
          {sections.map(([title, content], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h2>{title}</h2><p>{content}</p></div>
            </article>
          ))}
        </section>
        <footer>妙笔AI · 规则公开，人工核对</footer>
      </main>
    </>
  );
}
