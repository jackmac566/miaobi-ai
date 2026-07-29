import { requireChatGPTUser } from "../chatgpt-auth";
import { hasAdminAccess, runtimeEnv } from "../../lib/runtime";
import AdminDashboard from "./admin-dashboard";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  if (!await hasAdminAccess(user.email, await runtimeEnv())) {
    return <main className="access-denied"><div><span>权限受限</span><h1>这里仅限站长访问</h1><p>你已登录，但当前账号不在管理员白名单中。</p><Link href="/">返回创作首页</Link></div></main>;
  }
  return <AdminDashboard />;
}
