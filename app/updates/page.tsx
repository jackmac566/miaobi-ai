import type { Metadata } from "next";
import Link from "next/link";
import { changelog } from "../../lib/changelog";

export const metadata: Metadata = {
  title: "更新日志｜妙笔AI",
  description: "查看妙笔AI每次上线的新增功能、体验改进与问题修复。",
  alternates: { canonical: "/updates" },
  openGraph: {
    title: "更新日志｜妙笔AI",
    description: "查看妙笔AI每次上线的新增功能、体验改进与问题修复。",
    url: "/updates",
    images: [{ url: "/og-image.png", width: 1200, height: 630, type: "image/png" }],
  },
};

export default function UpdatesPage() {
  return (
    <main className="updates-shell">
      <header className="updates-header">
        <Link className="updates-brand" href="/"><span className="brand-mark">✎</span><b>妙笔AI</b></Link>
        <Link className="updates-back" href="/">返回创作台 →</Link>
      </header>
      <section className="updates-hero">
        <span>CHANGELOG · 全访客可见</span>
        <h1>每一次更新，<br/>都留下清楚的记录。</h1>
        <p>从正式版 V1.0.0 起，每次上线都会记录版本号、日期、用户可见变化和问题修复；平台内部部署次数不再混入产品版本。</p>
      </section>
      <section className="updates-timeline" aria-label="妙笔AI版本更新记录">
        {changelog.map(entry => (
          <article className={entry.current ? "current" : ""} key={entry.version}>
            <div className="updates-version">
              <b>{entry.version}</b>
              <time dateTime={entry.date}>{entry.date}</time>
              {entry.current && <span>当前版本</span>}
            </div>
            <div className="updates-content">
              <h2>{entry.title}</h2>
              <p>{entry.summary}</p>
              <h3>新增与改进</h3>
              <ul>{entry.highlights.map(item => <li key={item}>{item}</li>)}</ul>
              {!!entry.fixes?.length && <><h3>修复与调整</h3><ul>{entry.fixes.map(item => <li key={item}>{item}</li>)}</ul></>}
            </div>
          </article>
        ))}
      </section>
      <footer className="updates-footer">妙笔AI · 公开记录真实上线变化</footer>
    </main>
  );
}
