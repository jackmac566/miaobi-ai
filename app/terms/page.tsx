import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "用户协议｜妙笔AI",
  description: "妙笔AI 用户协议：服务范围、AI 内容说明与标识、会员与退款、账号注销、禁止行为与免责声明。",
  alternates: { canonical: "/terms" },
  robots: { index: true, follow: true },
};

const sections: Array<[string, string]> = [
  ["一、服务范围", "妙笔AI 提供中文文案生成、润色、改写与结构化写作辅助工具，由服务端调用 DeepSeek 完成。生成结果仅供写作参考，不构成专业建议；你应对发布内容的真实性、合规性与权利归属自行负责。"],
  ["二、AI 生成内容说明与标识", "本服务输出由人工智能生成。依据《人工智能生成合成内容标识办法》，生成结果旁标注“AI 生成”，导出与传播时应保留标识或注明来源。AI 输出可能存在错误、遗漏、过时或不适合特定平台的内容，发布前必须由你本人核对事实、版权与平台规则。"],
  ["三、账号与注销", "免费访客无需注册即可使用；登录后可识别会员身份并保存历史记录。你可随时在“我的账号”中注销并删除全部站内数据（见《隐私政策》第六条）。不得将账号借售给他人，不得利用本服务从事批量灌水、刷量或规避平台监管的行为。"],
  ["四、会员与退款", "会员权益以页面展示为准：更高单次版本数、更长输入、更高 24 小时额度与高级控制。人工收款以站长实际核对到账为准；重复付款、金额错误或付款后未开通权益，可凭支付记录联系站长原路退款；已开通并使用的服务，按未使用天数或未消费权益协商处理。接口故障或结果未通过质量检查时不扣次数。"],
  ["五、禁止行为", "不得使用本服务生成或传播：违法信息、诈骗或洗钱话术、赌博博彩推广、色情低俗内容、毒品相关内容、代写论文/作业/考试、侵犯他人权利的内容，或其他违反法律法规与公序良俗的内容。系统会对明显违规请求进行拦截，并保留拒绝服务与报告的权利。"],
  ["六、服务可用性", "本站会尽力保证服务可用，但不对因网络、上游模型、维护或不可抗力导致的中断承担责任；因接口故障导致生成失败的请求不扣次数。我们保留在必要时调整免费额度与服务范围的权利，并会通过更新日志公告。"],
  ["七、知识产权", "你提交的素材的著作权归你或权利人所有。生成内容的权利归属遵循适用法律与上游模型服务条款；因生成内容引发的侵权风险由发布者自行承担。本站的界面、文案与代码受法律保护，未经许可不得抄袭或商业复用（项目源码按 MIT 许可开源，详见仓库说明）。"],
  ["八、协议变更", "本协议更新时会在本页面更新日期，重大变更会在更新日志中说明；继续使用即视为接受更新后的协议。如不同意变更，可停止使用并注销账号。"],
  ["九、联系我们", "对本协议或服务有任何疑问，请通过站点公布的联系方式联系站长。请勿发送 API Key、密码、验证码或其他敏感凭据。"],
];

export default function TermsPage() {
  return (
    <>
      <a className="skip-link" href="#main-content">跳到用户协议正文</a>
      <main className="legal-page-shell" id="main-content">
        <header>
          <Link href="/"><span className="brand-mark">✎</span><b>妙笔AI</b></Link>
          <Link href="/">返回创作台 →</Link>
        </header>
        <section className="legal-page-hero">
          <span>TERMS OF SERVICE · 全访客可见</span>
          <h1>用户协议</h1>
          <p>把服务边界、AI 内容规则与双方权利义务写清楚。</p>
          <time dateTime="2026-11-06">更新日期：2026 年 11 月 6 日</time>
        </section>
        <section className="legal-page-grid" aria-label="用户协议正文">
          {sections.map(([title, content]) => (
            <article key={title}>
              <h2>{title}</h2>
              <p>{content}</p>
            </article>
          ))}
        </section>
        <footer className="legal-links">
          <Link href="/privacy">隐私政策</Link>
          <Link href="/legal">服务、隐私与退款说明</Link>
          <Link href="/updates">更新日志</Link>
        </footer>
      </main>
    </>
  );
}
