"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { changelog, latestChangelog } from "../lib/changelog";
import { MEMBERSHIP_TIERS } from "../lib/membership";
import {
  normalizeToolPreference,
  preferencesForTool,
  TOOL_INTENSITIES,
  toolIntensityInstruction,
  WRITING_STYLE_OPTIONS,
  WRITING_STYLE_PROFILES,
  type ToolIntensity,
} from "../lib/writing-controls";

type Scene = { id: string; name: string; desc: string; icon: string; color: string; group: string; fields: string[] };
type Draft = {
  id: number;
  batchId?: number;
  title: string;
  scene: string;
  content: string;
  createdAt: number;
  favorite?: boolean;
  topic?: string;
  details?: string;
  audience?: string;
  purpose?: string;
  requirements?: string;
  style?: string;
  length?: string;
};
type Capabilities = { versions: number; inputChars: number; historyItems: number; advancedControls: boolean; batchExport: boolean; premiumModel: boolean; externalAIDailyLimit: number };
type Account = { signedIn: boolean; name?: string; remaining: number | null; resetsAt?: number; isAdmin: boolean; isMember?: boolean; aiConfigured?: boolean; aiOperational?: boolean; aiProvider?: "deepseek"; aiProviderLabel?: "DeepSeek"; aiModel?: string; generationMode?: "deepseek"; paymentConfigured?: boolean; plan?: string; planExpiresAt?: number | null; capabilities?: Capabilities; signInPath?: string };
type AdvancedOptions = { emoji: boolean; autoFormat: boolean; riskGuard: boolean };
type ControlReceipt = { style?: string; preference?: string | null; intensity?: ToolIntensity | null; length?: string };
type PaymentMethod = { id: string; name: string; qr: string; crop?: "wechat" | "alipay" };
type ManualPayment = { enabled?: boolean; qr?: string; methods?: PaymentMethod[]; contact?: string; note?: string };
type GenerationResponse = {
  error?: string;
  code?: string;
  signIn?: string;
  results: string[];
  engineLabel?: string;
  appliedControls?: ControlReceipt;
  remaining?: number;
  resetsAt?: number;
};

declare global {
  interface Window {
    __MIAOBI_STATIC_MODE__?: boolean;
    __MIAOBI_PAYMENT__?: ManualPayment;
  }
}

const isStaticMode = () => typeof window !== "undefined" && window.__MIAOBI_STATIC_MODE__ === true;
const DEFAULT_MANUAL_PAYMENT: ManualPayment = {
  enabled: false,
  contact: "",
  note: "",
  methods: [],
};
const manualPayment = () => typeof window !== "undefined" ? (window.__MIAOBI_PAYMENT__ || DEFAULT_MANUAL_PAYMENT) : DEFAULT_MANUAL_PAYMENT;
const STATIC_DAILY_LIMIT = MEMBERSHIP_TIERS.free.dailyLimit;

const scenes: Scene[] = [
  { id: "moments", name: "朋友圈文案", desc: "记录生活，分享美好瞬间", icon: "◎", color: "coral", group: "社交内容", fields: ["主题或事情", "想表达的重点"] },
  { id: "redbook", name: "小红书种草", desc: "爆款标题＋正文＋话题标签", icon: "小红书", color: "red", group: "社交内容", fields: ["产品 / 地点 / 主题", "核心体验或卖点"] },
  { id: "video", name: "短视频脚本", desc: "镜头、口播、字幕与配乐方向", icon: "▶", color: "orange", group: "社交内容", fields: ["视频主题", "想传达的核心信息"] },
  { id: "resume", name: "简历优化", desc: "保留真实成果，精准匹配岗位", icon: "▤", color: "peach", group: "职场办公", fields: ["目标岗位", "原始工作 / 项目经历"] },
  { id: "weekly", name: "周报总结", desc: "清晰梳理工作，突出成果", icon: "◔", color: "gold", group: "职场办公", fields: ["本周完成的工作", "遇到的问题或下周计划"] },
  { id: "live", name: "直播话术", desc: "开场互动、卖点与促单全流程", icon: "●", color: "pink", group: "商业营销", fields: ["产品名称", "核心卖点与活动价格"] },
  { id: "email", name: "商务邮件", desc: "规范得体，沟通高效", icon: "✉", color: "blue", group: "职场办公", fields: ["邮件目的", "关键信息"] },
  { id: "paper", name: "论文辅助", desc: "选题拆解、论证框架与写作建议", icon: "A", color: "violet", group: "校园学习", fields: ["论文主题", "需要辅助的内容"] },
  { id: "store", name: "门店宣传", desc: "开业、促销、会员活动文案", icon: "店", color: "green", group: "商业营销", fields: ["门店与行业", "活动内容"] },
  { id: "love", name: "表白情书", desc: "把难说出口的话写得真诚", icon: "♡", color: "rose", group: "情感生活", fields: ["你们的关系", "想告诉对方的话"] },
  { id: "speech", name: "演讲发言", desc: "有结构、有情绪、有记忆点", icon: "♬", color: "indigo", group: "职场办公", fields: ["演讲场合与主题", "希望包含的内容"] },
  { id: "wechat", name: "公众号推文", desc: "标题、开头、框架与结尾引导", icon: "文", color: "teal", group: "商业营销", fields: ["文章主题", "核心观点与素材"] },
  { id: "weibo", name: "微博热点文案", desc: "短平快表达与话题互动", icon: "热", color: "red", group: "社交内容", fields: ["热点或话题", "你的观点与立场"] },
  { id: "zhihu", name: "知乎高赞回答", desc: "结论先行、论据清楚、有洞察", icon: "知", color: "blue", group: "社交内容", fields: ["问题原文", "你的经历或核心观点"] },
  { id: "community", name: "社群运营", desc: "通知、促活、福利与群公告", icon: "群", color: "green", group: "社交内容", fields: ["社群类型与目的", "活动或通知详情"] },
  { id: "monthly", name: "月报总结", desc: "成果数据、问题复盘与下月计划", icon: "月", color: "gold", group: "职场办公", fields: ["本月主要工作", "数据成果与下月计划"] },
  { id: "annual", name: "年终总结", desc: "全年亮点、成长复盘与来年目标", icon: "年", color: "orange", group: "职场办公", fields: ["年度工作内容", "关键成果与不足"] },
  { id: "proposal", name: "方案策划", desc: "目标、策略、执行与预算框架", icon: "策", color: "violet", group: "职场办公", fields: ["项目或活动主题", "目标、对象与限制条件"] },
  { id: "meeting", name: "会议纪要", desc: "自动提炼结论、待办与责任人", icon: "会", color: "indigo", group: "职场办公", fields: ["会议转写内容", "需要重点保留的信息"] },
  { id: "selfintro", name: "求职自荐信", desc: "匹配岗位需求，突出个人价值", icon: "荐", color: "peach", group: "职场办公", fields: ["目标公司与岗位", "个人经历与优势"] },
  { id: "abstract", name: "论文摘要", desc: "提炼研究背景、方法、结果与结论", icon: "摘", color: "violet", group: "校园学习", fields: ["论文主题与正文要点", "专业与字数要求"] },
  { id: "literature", name: "文献综述框架", desc: "梳理主题脉络、争议与研究空白", icon: "综", color: "blue", group: "校园学习", fields: ["研究主题", "已有文献或关注方向"] },
  { id: "leave", name: "请假条", desc: "理由得体、时间明确、格式规范", icon: "假", color: "teal", group: "校园学习", fields: ["请假原因与时间", "称呼及补充说明"] },
  { id: "scholarship", name: "奖学金申请", desc: "呈现成绩、实践与综合表现", icon: "奖", color: "gold", group: "校园学习", fields: ["申请奖项", "成绩、荣誉与实践经历"] },
  { id: "club", name: "社团招新", desc: "有氛围、有亮点、有行动号召", icon: "社", color: "orange", group: "校园学习", fields: ["社团名称与特点", "招新时间、地点与福利"] },
  { id: "defense", name: "答辩稿", desc: "研究逻辑清楚，重点适合口头表达", icon: "辩", color: "indigo", group: "校园学习", fields: ["论文或项目主题", "研究内容与主要结论"] },
  { id: "product-title", name: "电商商品标题", desc: "提炼关键词、卖点与搜索意图", icon: "商", color: "coral", group: "商业营销", fields: ["商品名称与平台", "规格、卖点与目标人群"] },
  { id: "product-detail", name: "商品详情页", desc: "痛点、卖点、证据与购买理由", icon: "详", color: "red", group: "商业营销", fields: ["商品信息", "核心卖点与使用场景"] },
  { id: "poster", name: "海报宣传文案", desc: "主标题、副标题、卖点与行动号召", icon: "报", color: "pink", group: "商业营销", fields: ["海报主题", "活动规则与目标受众"] },
  { id: "review", name: "好评回复", desc: "真诚回应，兼顾复购与门店形象", icon: "评", color: "green", group: "商业营销", fields: ["顾客评价内容", "门店或商品特点"] },
  { id: "apology", name: "道歉与和解", desc: "承担问题、表达理解、提出行动", icon: "歉", color: "rose", group: "情感生活", fields: ["发生了什么", "对方在意的点与弥补方式"] },
  { id: "blessing", name: "节日生日祝福", desc: "根据对象和关系定制祝福", icon: "福", color: "gold", group: "情感生活", fields: ["节日与祝福对象", "关系、回忆或特别愿望"] },
  { id: "invitation", name: "请柬邀请函", desc: "婚礼、生日、升学宴与活动邀请", icon: "邀", color: "peach", group: "情感生活", fields: ["活动类型与主人", "时间、地点与邀请对象"] },
  { id: "thanks", name: "感谢信", desc: "把感谢写得具体、真诚、有分寸", icon: "谢", color: "rose", group: "情感生活", fields: ["感谢对象", "具体事件与想表达的心意"] },
  { id: "polish", name: "智能润色", desc: "提升流畅度、准确性与表达质感", icon: "润", color: "coral", group: "通用处理", fields: ["需要润色的原文", "希望的语气或用途"] },
  { id: "rewrite", name: "内容改写", desc: "保留原意，提供自然的新表达", icon: "改", color: "orange", group: "通用处理", fields: ["需要改写的原文", "改写强度与目标用途"] },
  { id: "expand", name: "扩写充实", desc: "补充细节、逻辑与完整段落", icon: "扩", color: "blue", group: "通用处理", fields: ["短句或提纲", "期望长度与补充方向"] },
  { id: "summarize", name: "缩写提炼", desc: "摘要、一句话总结与核心要点", icon: "缩", color: "teal", group: "通用处理", fields: ["需要压缩的长文", "摘要长度或输出形式"] },
  { id: "translate", name: "多语言翻译", desc: "中英日韩等自然互译", icon: "译", color: "violet", group: "通用处理", fields: ["需要翻译的文本", "目标语言与使用场景"] },
  { id: "proofread", name: "纠错校对", desc: "检查错字、标点、语法与病句", icon: "校", color: "green", group: "通用处理", fields: ["需要校对的文本", "是否需要解释修改原因"] },
  { id: "transform", name: "风格转换", desc: "正式、温柔、搞笑与文言风格", icon: "风", color: "pink", group: "通用处理", fields: ["原始文本", "目标风格与使用场景"] },
  { id: "headlines", name: "爆款标题生成", desc: "一次生成多种方向的吸睛标题", icon: "题", color: "red", group: "通用处理", fields: ["正文或主题", "发布平台与目标读者"] },
  { id: "mindmap", name: "思维导图大纲", desc: "把主题拆成结构化树状框架", icon: "纲", color: "indigo", group: "通用处理", fields: ["主题或任务", "希望覆盖的重点"] },
];

const tools = [
  ["智能润色", "优化表达质感与语句流畅度", "✦", "4 种输出偏好 · 3 档强度"],
  ["内容改写", "保留原意，换一种更自然的表达", "↻", "4 种输出偏好 · 轻度 / 标准 / 深度"],
  ["扩写充实", "把短句或提纲扩展成完整内容", "↗", "结构 / 逻辑 / 表达细节"],
  ["缩写提炼", "长文变摘要、一句话或核心要点", "↙", "摘要 / 一句话 / 要点列表"],
  ["多语言翻译", "中英日韩等语言自然互译", "译", "英文 / 日文 / 韩文 / 繁体中文"],
  ["纠错校对", "检查错字、标点、语法与病句", "✓", "修订说明 / 只给修订稿"],
  ["风格转换", "按规则重写语气、句式与节奏", "≈", "5 种真实风格"],
  ["标题生成", "一次生成 10 个不同方向标题", "T", "公众号 / 小红书 / 短视频 / 电商"],
  ["思维导图", "把主题拆成结构化树状大纲", "⌘", "文章 / 项目 / 学习 / 演讲"],
];

type Inspiration = { text: string; category: string; tag: string; signature: string };

const inspirationBanks = [
  { category: "朋友圈", tag: "生活感悟", openings: ["慢一点没关系", "今天不赶路", "把普通日子过得具体", "生活偶尔也需要留白", "允许自己暂时松一口气", "风吹过来的时候", "真正值得记录的", "忙里偷来的这一刻"], subjects: ["好戏都藏在烟火里", "快乐正在很小的地方发生", "平凡也有自己的光", "心会慢慢回到喜欢的频道", "比计划更重要的是感受", "日落替我按下了暂停键", "那些小确幸正在偷偷靠近", "此刻已经足够珍贵"], turns: ["不用解释给所有人听", "不必每一步都算数", "认真感受就好", "留给未来慢慢回味", "让情绪先坐一会儿", "把答案交给时间", "先照顾好自己的心情", "也算和生活握了握手"], endings: ["今天也算没有辜负自己", "愿我们忙而有序，闲而有趣", "生活不是赶路，是感受路", "这一页就写到温柔为止", "祝你我都有随时重启的勇气", "普通的一天也值得收藏", "快乐不必盛大，刚刚好就好", "以后想起时，嘴角会先知道"] },
  { category: "小红书", tag: "真实分享", openings: ["最近认真用了一段时间", "如果你也在比较", "先说我最在意的一点", "把实际感受放在前面", "这份体验更适合这样看", "用下来，有优点也有边界", "给正在做功课的人一个参考", "不讲空话，直接看细节"], subjects: ["这个具体体验", "这套实际做法", "这份新手攻略", "这个容易忽略的细节", "这套省步骤的思路", "这次使用后的真实感受", "这个需要先确认的选择", "这份按需求整理的清单"], turns: ["优点和注意事项分开说", "适合谁、不适合谁都写清楚", "先核对需求，再决定是否合适", "具体信息比口号更有用", "没有体验过的部分不下结论", "价格、规格和效果以实际信息为准", "把自己真正用到的部分讲明白", "先看限制，再看亮点"], endings: ["希望能帮你少一点纠结", "有具体问题可以继续交流", "按自己的使用场景做决定", "先收藏，比较时可以回来核对", "欢迎分享你的实际体验", "需要清单可以在评论里说", "这就是目前最真实的感受", "合不合适，最终还是看你的需求"] },
  { category: "短视频", tag: "清楚开场", openings: ["先把问题说清楚", "如果你也遇到同样的情况", "今天只讲一个具体方法", "这件事可以从第一步开始", "先看最容易忽略的细节", "别急着做，先确认这一点", "用一个实际场景说明", "把复杂问题拆开来看"], subjects: ["新手上手时最需要确认的事", "让内容更清楚的核心步骤", "反复出错时该检查的地方", "从零开始前要准备的信息", "把需求变成行动的方法", "减少无效返工的做法", "判断是否适合自己的标准", "把现有信息整理清楚的过程"], turns: ["答案取决于你的具体条件", "接下来按顺序看每一步", "重点是把已知和待确认分开", "先说明原因，再给操作", "每个动作都对应一个明确目的", "遇到不同情况要分别处理", "做完记得回到目标检查结果", "没有依据的结论先不要下"], endings: ["你可以先从第一步试起", "有具体场景可以继续拆解", "把你的情况说清楚再做判断", "下一次可以展开完整实操", "需要模板可以继续留言", "做完后记得核对实际结果", "这套方法的关键是信息准确", "你还卡在哪一步"] },
  { category: "职场", tag: "汇报表达", openings: ["真正专业的汇报", "让领导快速听懂的表达", "职场里最稀缺的能力", "会做事的人更要会", "别只汇报过程", "高质量复盘的第一句", "拉开差距的从来不是忙", "成熟的职场表达"], subjects: ["不是讲做了什么，而是改变了什么", "先说结论，再给依据", "把模糊努力变成可衡量结果", "让每一项工作都对应业务价值", "把问题、动作和下一步连起来", "用数据替代空泛的形容", "主动暴露风险并给出方案", "让别人知道你解决了什么"], turns: ["重点不是证明辛苦", "信息越复杂越要有顺序", "结果需要被准确看见", "先对齐目标再讨论动作", "专业感来自清晰和分寸", "少说正确的废话", "让下一步变得可执行", "每句话都要服务于决策"], endings: ["这才是汇报的价值", "清晰本身就是影响力", "把结果讲清楚也是能力", "让努力真正沉淀成信用", "做事有闭环，表达有重点", "不用抢功，也不会被忽略", "让对方听完知道如何行动", "真正的靠谱都有迹可循"] },
  { category: "门店营销", tag: "活动创意", openings: ["这次不是简单打折", "给老朋友准备了一点", "开业的第一份诚意", "天气变了，福利也该", "把周末的快乐安排上", "今天想认真感谢", "限时活动不玩套路", "来店里的理由又多了一个"], subjects: ["让人愿意回来坐坐的理由", "看得见也用得上的福利", "不抬价再打折的真优惠", "新客敢尝试、老客有惊喜的安排", "把体验感放在价格前面的活动", "适合带朋友一起来的组合", "只有这几天才有的限定内容", "为附近街坊准备的小心意"], turns: ["数量有限，但诚意不限", "规则已经写得明明白白", "不用凑单，也没有隐藏门槛", "到店就能直接享受", "希望你来不只是为了便宜", "想把好东西留给懂的人", "名额满了就恢复日常", "先到先选，错过不补"], endings: ["等你回来坐坐", "把喜欢的朋友一起带来", "这次别再说没赶上", "路过就进来看看", "愿每次见面都有新惊喜", "活动结束，但好服务一直都在", "附近的朋友记得收藏", "给生活加一点刚刚好的甜"] },
  { category: "情感", tag: "真心表达", openings: ["我不是突然想你", "有些话不适合匆忙说", "喜欢不是一时兴起", "遇见你以后才发现", "我记得的从来不只是", "如果思念有声音", "想把今天的温柔分你一半", "最好的关系大概是"], subjects: ["是今天的风很像我们见面的那天", "是那些被你认真接住的小情绪", "是平凡日子里总能想到彼此", "是不用表演也能安心做自己", "是隔着人海仍然坚定地选择", "是每个下意识分享的瞬间", "是吵过以后仍愿意好好说话", "是未来计划里自然有你的位置"], turns: ["不需要华丽的证明", "时间会替真心留下答案", "小事比誓言更诚实", "靠近本身就已经很珍贵", "我想认真对待每一次回应", "爱应该让人更自在", "我们的故事可以慢慢写", "谢谢你没有敷衍我的认真"], endings: ["希望下一次日落还是和你", "很高兴你出现在我的生活里", "余下的话，见面慢慢说", "想把偏爱和例外都留给你", "愿我们有话直说，也有爱慢慢说", "不求轰轰烈烈，只求一直真诚", "未来很远，但我愿意一起走", "今天喜欢你，明天也是"] },
  { category: "校园", tag: "成长记录", openings: ["青春最好的答案", "这一路看起来跌跌撞撞", "毕业不是故事的结尾", "努力的意义也许是", "那些早起和熬夜的日子", "校园时光最珍贵的", "原来成长真的没有提示音", "写给正在赶路的自己"], subjects: ["不是满分，而是没有提前放弃", "正在悄悄拼成更完整的自己", "是带着勇气去往下一站", "让未来拥有更多选择", "最终都会变成底气", "是和一群人共同拥有的回忆", "回头时才发现已经走了很远", "请相信慢慢来也是一种前进"], turns: ["允许迷茫，但别停在原地", "每一步都算数", "不用和别人共用进度条", "过程本身就值得纪念", "先完成，再慢慢完美", "把焦虑换成今天能做的一件事", "答案会在行动里出现", "你已经比想象中更勇敢"], endings: ["下一站继续闪闪发光", "愿此去前程似锦，再见仍是少年", "山高路远，我们顶峰相见", "别怕，未来正在来的路上", "这一次为认真生活的自己鼓掌", "好好告别，也好好出发", "愿所有努力都有回声", "带着热爱奔赴新的章节"] },
  { category: "自媒体", tag: "内容选题", openings: ["流量不是凭空出现的", "一个好选题首先要", "让用户愿意停留的内容", "别再只顾着输出", "真正容易传播的观点", "内容没有反馈时先检查", "普通创作者最该建立的", "想让账号持续增长"], subjects: ["来自对具体人群的具体理解", "同时满足好奇、共鸣和获得感", "先解决一个真实的小问题", "用户为什么要花时间看你", "往往说出了大家想说却没说的话", "开头是否给了继续看的理由", "不是人设，而是稳定的价值预期", "就要让每篇内容都有明确任务"], turns: ["先把受众写成一个人", "标题承诺什么，正文就交付什么", "降低理解成本，增加行动价值", "情绪负责吸引，信息负责留住", "具体案例比抽象观点更有力量", "持续复盘高于盲目日更", "别追所有热点，只追相关热点", "让读者看完能立刻带走一样东西"], endings: ["这才是长期主义的流量", "收藏和转发自然会发生", "内容好不好，用户行为会回答", "先有价值，再谈爆款", "稳定更新，也稳定进步", "让每一次发布都更接近目标", "账号的信任就是这样积累的", "先写给一个人，再影响一群人"] },
] as const;

const inspirationTemplates = [
  (a: string, b: string, c: string, d: string) => `${a}，${b}。${c}，${d}。`,
  (a: string, b: string, c: string, d: string) => `${a}：${b}。${c}——${d}。`,
  (a: string, b: string, c: string, d: string) => `${a}，因为${b}；${c}，所以${d}。`,
  (a: string, b: string, c: string, d: string) => `${a}。${b}，${c}。${d}。`,
  (a: string, b: string, c: string, d: string) => `${a}，${b}；别忘了${c}，也请记得${d}。`,
];

const inspirationEmojis = ["", " ✨", " 🌿", " ☀️", " 💫", " 🍃"];

function composeInspiration(parts: number[]): Inspiration {
  const bank = inspirationBanks[parts[0] % inspirationBanks.length];
  const opening = bank.openings[parts[1] % bank.openings.length];
  const subject = bank.subjects[parts[2] % bank.subjects.length];
  const turn = bank.turns[parts[3] % bank.turns.length];
  const ending = bank.endings[parts[4] % bank.endings.length];
  const template = inspirationTemplates[parts[5] % inspirationTemplates.length];
  const emoji = inspirationEmojis[parts[6] % inspirationEmojis.length];
  return { text: `${template(opening, subject, turn, ending)}${emoji}`, category: bank.category, tag: bank.tag, signature: parts.join("-") };
}

const quoteInspirations = [
  composeInspiration([0, 0, 0, 0, 0, 0, 0]),
  composeInspiration([1, 1, 2, 3, 4, 1, 1]),
  composeInspiration([5, 2, 3, 4, 5, 3, 2]),
];

function nextInspiration(): Inspiration {
  let used: string[] = [];
  try { used = JSON.parse(localStorage.getItem("miaobi-inspirations-seen") || "[]"); } catch { used = []; }
  const usedSet = new Set(used);
  let result = composeInspiration([0, 0, 0, 0, 0, 0, 0]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const random = crypto.getRandomValues(new Uint32Array(7));
    const candidate = composeInspiration(Array.from(random));
    result = candidate;
    if (!usedSet.has(candidate.signature)) break;
  }
  const updated = [...used.slice(-4999), result.signature];
  localStorage.setItem("miaobi-inspirations-seen", JSON.stringify(updated));
  return result;
}

const nav = [
  ["home", "⌂", "首页"], ["create", "✎", "创作"], ["tools", "▦", "工具箱"], ["library", "□", "素材库"], ["history", "◷", "历史"],
];

const initialHistory: Draft[] = [];

const sceneInferenceRules: Array<[RegExp, string]> = [
  [/(小红书|种草|探店|笔记)/i, "redbook"],
  [/(短视频|口播|镜头|脚本|抖音)/i, "video"],
  [/(简历|求职经历|岗位匹配)/i, "resume"],
  [/(周报|本周工作)/i, "weekly"],
  [/(月报|本月工作)/i, "monthly"],
  [/(年终|年度总结)/i, "annual"],
  [/(邮件|mail|函件)/i, "email"],
  [/(会议纪要|会议记录)/i, "meeting"],
  [/(论文摘要|摘要)/i, "abstract"],
  [/(论文|文献|研究)/i, "paper"],
  [/(直播|直播间)/i, "live"],
  [/(商品标题|电商标题)/i, "product-title"],
  [/(详情页|商品详情)/i, "product-detail"],
  [/(海报|宣传单)/i, "poster"],
  [/(道歉|和解|对不起)/i, "apology"],
  [/(祝福|生日|节日)/i, "blessing"],
  [/(邀请|请柬)/i, "invitation"],
  [/(感谢|致谢)/i, "thanks"],
];

function inferScene(value: string) {
  const matched = sceneInferenceRules.find(([pattern]) => pattern.test(value));
  return scenes.find(item => item.id === matched?.[1]) || scenes[0];
}

function relativeTime(createdAt: number) {
  const elapsed = Math.max(0, Date.now() - createdAt);
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  return new Date(createdAt).toLocaleDateString("zh-CN");
}

function friendlyGenerationError(error: unknown, fallback: string) {
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "请求超时，本次未完成，请稍后重试";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function Home() {
  const [page, setPage] = useState(() => typeof window !== "undefined" && window.__MIAOBI_STATIC_MODE__ === true && location.pathname === "/updates" ? "updates" : "home");
  const [scene, setScene] = useState<Scene>(scenes[0]);
  const [topic, setTopic] = useState("");
  const [details, setDetails] = useState("");
  const [audience, setAudience] = useState("");
  const [purpose, setPurpose] = useState("");
  const [requirements, setRequirements] = useState("");
  const [style, setStyle] = useState("自然松弛");
  const [length, setLength] = useState("标准 · 150—300字");
  const [versionCount, setVersionCount] = useState(3);
  const [advancedOptions, setAdvancedOptions] = useState<AdvancedOptions>({ emoji: false, autoFormat: false, riskGuard: true });
  const [count, setCount] = useState<number>(STATIC_DAILY_LIMIT);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [engineLabel, setEngineLabel] = useState("智能引擎");
  const [generationReceipt, setGenerationReceipt] = useState<ControlReceipt>({ style: "自然松弛", length: "标准 · 150—300字" });
  const [generationError, setGenerationError] = useState("");
  const [history, setHistory] = useState<Draft[]>(initialHistory);
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<"member" | "share" | "profile" | "legal" | null>(() =>
    typeof window !== "undefined" && window.__MIAOBI_STATIC_MODE__ === true && location.pathname === "/legal" ? "legal" : null
  );
  const [tool, setTool] = useState<string | null>(null);
  const [toolText, setToolText] = useState("");
  const [toolResult, setToolResult] = useState("");
  const [toolIntensity, setToolIntensity] = useState<ToolIntensity>("标准");
  const [toolPreference, setToolPreference] = useState("自然表达");
  const [toolReceipt, setToolReceipt] = useState<ControlReceipt>({ preference: "自然表达", intensity: "标准" });
  const [toolError, setToolError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("全部");
  const [account, setAccount] = useState<Account>({ signedIn: false, remaining: STATIC_DAILY_LIMIT, isAdmin: false });
  const [accountSyncFailed, setAccountSyncFailed] = useState(false);
  const premiumAccess = account.isMember === true || account.isAdmin === true;

  useEffect(() => {
    const saved = localStorage.getItem("miaobi-history");
    let parsed: Draft[] | null = null;
    try {
      const raw = saved ? JSON.parse(saved) as Array<Partial<Draft> & { time?: string }> : null;
      parsed = Array.isArray(raw) ? raw
        .filter(item => typeof item.content === "string" && typeof item.scene === "string")
        .map((item, index) => ({
          id: Number(item.id) || Date.now() - index,
          batchId: Number(item.batchId) || Number(item.id) || Date.now() - index,
          title: String(item.title || "未命名创作"),
          scene: String(item.scene),
          content: String(item.content),
          createdAt: Number(item.createdAt) || Date.now() - index * 1000,
          favorite: item.favorite === true,
          topic: item.topic ? String(item.topic) : String(item.title || ""),
          details: item.details ? String(item.details) : "",
          audience: item.audience ? String(item.audience) : "",
          purpose: item.purpose ? String(item.purpose) : "",
          requirements: item.requirements ? String(item.requirements) : "",
          style: item.style ? String(item.style) : "",
          length: item.length ? String(item.length) : "",
        })) : null;
    } catch { parsed = null; }
    const timer = Array.isArray(parsed) ? setTimeout(() => setHistory(parsed!), 0) : undefined;
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  useEffect(() => {
    try { localStorage.setItem("miaobi-history", JSON.stringify(history)); } catch { /* storage quota or private browsing */ }
  }, [history]);

  useEffect(() => {
    fetch("/api/account", { cache: "no-store", signal: AbortSignal.timeout(12_000) }).then(async r => await r.json() as Account).then(next => {
      setAccount(next);
      setAccountSyncFailed(false);
      setVersionCount(next.isMember || next.isAdmin ? 6 : 3);
      if (typeof next.remaining === "number") setCount(next.remaining);
    }).catch(() => {
      setAccountSyncFailed(true);
      setAccount(current => ({ ...current, remaining: null }));
    });
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || location.protocol !== "https:") return;
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      // The site remains fully usable when private-browsing or policy settings block installation.
    });
  }, []);

  const showToast = (text: string) => { setToast(text); setTimeout(() => setToast(""), 1800); };
  const chooseTool = (next: string | null) => {
    setTool(next);
    setToolPreference(preferencesForTool(next)[0]);
    setToolResult("");
    setToolError("");
  };
  const groups = ["全部", "社交内容", "职场办公", "校园学习", "商业营销", "情感生活", "通用处理"];
  const shownScenes = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return scenes.filter(s => (filter === "全部" || s.group === filter) && (!keyword || `${s.name} ${s.desc} ${s.group}`.toLowerCase().includes(keyword)));
  }, [filter, search]);

  const chooseScene = (s: Scene) => {
    setScene(s);
    setPage("create");
    setResults([]);
    setGenerationError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const saveHistory = (next: string[], targetScene: Scene) => {
    const now = Date.now();
    const entries: Draft[] = next.map((content, index) => ({
      id: now + index,
      batchId: now,
      title: `${(topic || `新的${targetScene.name}`).slice(0, 60)}${next.length > 1 ? ` · 版本${index + 1}` : ""}`,
      scene: targetScene.name,
      content,
      createdAt: now,
      topic: index === 0 ? topic : "",
      details: index === 0 ? details : "",
      audience: index === 0 ? audience : "",
      purpose: index === 0 ? purpose : "",
      requirements: index === 0 ? requirements : "",
      style: index === 0 ? style : "",
      length: index === 0 ? length : "",
    }));
    setHistory(current => [...entries, ...current].slice(0, premiumAccess ? 100 : 30));
  };
  const generateForScene = async (targetScene: Scene) => {
    if (generating) return;
    if (!topic.trim()) {
      setGenerationError("请先输入想写的主题和已知事实");
      showToast("请先输入想写的主题");
      return;
    }
    if (count <= 0 && account.remaining !== null) { setModal("member"); return; }
    setGenerationError("");
    setGenerating(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: targetScene.name,
          topic,
          details,
          audience,
          purpose,
          requirements,
          style,
          length,
          versionCount,
          options: advancedOptions,
        }),
        signal: AbortSignal.timeout(40_000),
      });
      const data = await response.json() as GenerationResponse;
      if (response.status === 401 && data.signIn) { window.location.href = data.signIn; return; }
      if (!response.ok) {
        const message = data.error || "生成失败，请稍后重试";
        setGenerationError(message);
        showToast(message);
        if (data.code === "QUOTA_EXCEEDED") setModal("member");
        return;
      }
      const next = data.results as string[];
      setEngineLabel(data.engineLabel || "DeepSeek");
      setGenerationReceipt(data.appliedControls || { style, length });
      setGenerationError("");
      setResults(next);
      const remaining = typeof data.remaining === "number" ? data.remaining : null;
      if (remaining !== null) setCount(remaining);
      if (typeof data.resetsAt === "number") {
        const resetsAt = data.resetsAt;
        setAccountSyncFailed(false);
        setAccount(current => ({ ...current, remaining: remaining ?? current.remaining, resetsAt }));
      }
      saveHistory(next, targetScene);
    } catch (error) {
      const message = error instanceof DOMException && error.name === "TimeoutError"
        ? "生成超时，本次未完成，请稍后重试"
        : "生成失败，请检查网络后重试";
      setGenerationError(message);
      showToast(message);
    }
    finally { setGenerating(false); }
  };
  const generate = () => generateForScene(scene);
  const quickGenerate = () => {
    const inferred = inferScene(topic);
    setScene(inferred);
    setPage("create");
    void generateForScene(inferred);
  };
  const copy = async (text: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(text); showToast("已复制到剪贴板");
    } catch { showToast("浏览器未允许复制，请手动选择文字"); }
  };
  const favorite = (content: string) => {
    setHistory(current => {
      let toggled = false;
      const updated = current.map(item => {
        if (toggled || item.content !== content) return item;
        toggled = true;
        return { ...item, favorite: !item.favorite };
      });
      if (toggled) return updated;
      return [{
        id: Date.now(),
        title: `${topic || scene.name} · 手动编辑`,
        scene: scene.name,
        content,
        createdAt: Date.now(),
        favorite: true,
        topic,
        details,
        audience,
        purpose,
        requirements,
        style,
        length,
      }, ...updated].slice(0, premiumAccess ? 100 : 30);
    });
    showToast("收藏状态已更新");
  };
  const refineResult = async (index: number, action: "natural" | "shorten") => {
    const source = results[index];
    if (!source || generating) return;
    if (count <= 0 && account.remaining !== null) { setModal("member"); return; }
    const refineTool = action === "natural" ? "自然化改写" : "精简表达";
    setGenerationError("");
    setGenerating(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: refineTool,
          topic: source,
          style: action === "natural" ? "自然松弛" : "简洁有力",
          preference: action === "natural" ? "自然表达" : "核心摘要",
          intensity: action === "natural" ? "深度" : "标准",
        }),
        signal: AbortSignal.timeout(40_000),
      });
      const data = await response.json() as GenerationResponse;
      if (response.status === 401 && data.signIn) { window.location.href = data.signIn; return; }
      if (!response.ok) {
        const message = data.error || "优化失败";
        setGenerationError(message);
        showToast(message);
        return;
      }
      const refined = data.results?.[0] || "";
      setEngineLabel(data.engineLabel || "DeepSeek");
      setGenerationReceipt(data.appliedControls || {
        style: action === "natural" ? "自然松弛" : "简洁有力",
        preference: action === "natural" ? "自然表达" : "核心摘要",
        intensity: action === "natural" ? "深度" : "标准",
      });
      if (typeof data.remaining === "number") {
        const remaining = data.remaining;
        setCount(remaining);
        setAccountSyncFailed(false);
        setAccount(current => ({ ...current, remaining, resetsAt: data.resetsAt ?? current.resetsAt }));
      }
      if (!refined) {
        setGenerationError("本次没有返回可用内容");
        showToast("本次没有返回可用内容");
        return;
      }
      setGenerationError("");
      setResults(current => current.map((item, itemIndex) => itemIndex === index ? refined : item));
      setHistory(current => [{
        id: Date.now(),
        title: `${topic || scene.name} · ${action === "natural" ? "自然化" : "精简"}`,
        scene: scene.name,
        content: refined,
        createdAt: Date.now(),
        topic,
        details,
        audience,
        purpose,
        requirements,
        style,
        length,
      }, ...current].slice(0, premiumAccess ? 100 : 30));
      showToast(action === "natural" ? "已减少套话并改得更自然" : "已保留重点并精简");
    } catch (error) {
      const message = friendlyGenerationError(error, "优化失败，请检查网络后重试");
      setGenerationError(message);
      showToast(message);
    } finally {
      setGenerating(false);
    }
  };
  const setAdvancedOption = (key: keyof AdvancedOptions) => {
    if (!premiumAccess) { setModal("member"); return; }
    setAdvancedOptions(current => ({ ...current, [key]: !current[key] }));
  };
  const updateResultAt = (index: number, value: string) => {
    const previous = results[index];
    setResults(current => current.map((item, itemIndex) => itemIndex === index ? value : item));
    if (!previous) return;
    setHistory(current => {
      let updated = false;
      return current.map(item => {
        if (updated || item.content !== previous) return item;
        updated = true;
        return { ...item, content: value };
      });
    });
  };
  const chooseVersionCount = (next: number) => {
    if (next > 3 && !premiumAccess) { setModal("member"); return; }
    setVersionCount(next);
  };
  const exportResults = () => {
    if (!premiumAccess) { setModal("member"); return; }
    if (!results.length) return showToast("请先生成文案");
    const text = results.map((item, index) => `版本 ${index + 1}\n${item}`).join("\n\n--------------------\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `妙笔AI-${scene.name}-${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("已导出全部版本");
  };
  const runTool = async () => {
    if (!toolText.trim()) {
      setToolError("请先粘贴需要处理的文字");
      showToast("请先粘贴需要处理的文字");
      return;
    }
    if (count <= 0 && account.remaining !== null) { setModal("member"); return; }
    setToolError("");
    setGenerating(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool,
          topic: toolText,
          preference: toolPreference,
          intensity: toolIntensity,
        }),
        signal: AbortSignal.timeout(40_000),
      });
      const data = await response.json() as GenerationResponse;
      if (response.status === 401 && data.signIn) { window.location.href = data.signIn; return; }
      if (!response.ok) {
        const message = data.error || "处理失败";
        setToolError(message);
        showToast(message);
        return;
      }
      setToolError("");
      setToolResult(data.results[0]);
      setEngineLabel(data.engineLabel || "DeepSeek");
      setToolReceipt(data.appliedControls || { preference: toolPreference, intensity: toolIntensity });
      if (typeof data.remaining === "number") {
        const remaining = data.remaining;
        setCount(remaining);
        setAccountSyncFailed(false);
        setAccount(current => ({ ...current, remaining, resetsAt: data.resetsAt ?? current.resetsAt }));
      }
      setHistory(current => [{
        id: Date.now(),
        title: tool || "文本处理",
        scene: tool || "文本工具",
        content: data.results[0],
        createdAt: Date.now(),
        topic: toolText.slice(0, 80),
      }, ...current].slice(0, premiumAccess ? 100 : 30));
    } catch (error) {
      const message = friendlyGenerationError(error, "处理失败，请检查网络后重试");
      setToolError(message);
      showToast(message);
    }
    finally { setGenerating(false); }
  };
  const signInHref = account.signInPath || (isStaticMode() ? "/login" : "/signin-with-chatgpt?return_to=%2F");

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <aside className="sidebar">
      <button className="brand" aria-label="返回妙笔AI首页" onClick={() => setPage("home")}><span className="brand-mark">✎</span><b>妙笔AI</b></button>
      <nav aria-label="主导航">{nav.map(([id, icon, label]) => <button key={id} aria-current={page === id ? "page" : undefined} className={page === id ? "active" : ""} onClick={() => setPage(id)}><span>{icon}</span>{label}</button>)}</nav>
      <button className={`sidebar-update ${page === "updates" ? "active" : ""}`} onClick={() => setPage("updates")}><span>↻</span>更新日志<i>{latestChangelog.version}</i></button>
      <div className="side-bottom">
        <button onClick={() => setModal("member")} className="vip-card"><span>♛</span><div><b>{premiumAccess ? "会员权益已生效" : "升级会员"}</b><small>{premiumAccess ? "6 个版本 · 24h 100 次" : "长素材 · 6 个版本"}</small></div></button>
        {account.isAdmin && <a className="admin-link" href="/admin"><span>⚙</span>运营后台</a>}
      </div>
    </aside>

    <main className="main" id="main-content">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark">✎</span><b>妙笔AI</b></div>
        <div className="top-actions">
          <button className="stat-pill" onClick={() => setModal("member")} aria-label={accountSyncFailed ? "额度暂未同步，点击查看账户说明" : `${premiumAccess ? "会员" : "免费"}账户，滚动24小时剩余${count}次`}>
            <span className="status-long">{premiumAccess ? "会员" : "免费"} · 24h 剩余</span>
            <span className="status-short">{premiumAccess ? "会员" : "免费"}</span>
            <b>{accountSyncFailed ? "—" : count}</b><i>{accountSyncFailed ? "待同步" : "次"}</i>
          </button>
          {!account.signedIn && <a className="top-signin" href={signInHref}>登录 / 注册</a>}
          {account.signedIn && <button className="top-account" onClick={() => setModal("profile")}>我的账号</button>}
          {account.isAdmin && <a className="top-admin" href="/admin">运营后台</a>}
          {isStaticMode() && <span className="top-local" title="国内访客版由服务端安全调用 DeepSeek">国内访客版</span>}
          <button className="avatar" onClick={() => setModal("profile")}>{account.name?.slice(0, 1) || "妙"}</button>
        </div>
      </header>

      {page === "home" && <HomePage setPage={setPage} chooseScene={chooseScene} topic={topic} setTopic={setTopic} style={style} setStyle={setStyle} generate={quickGenerate} generating={generating} openMember={() => setModal("member")} premiumAccess={premiumAccess} />}
      {page === "create" && <CreatePage scene={scene} setScene={setScene} topic={topic} setTopic={setTopic} details={details} setDetails={setDetails} audience={audience} setAudience={setAudience} purpose={purpose} setPurpose={setPurpose} requirements={requirements} setRequirements={setRequirements} style={style} setStyle={setStyle} length={length} setLength={setLength} versionCount={versionCount} chooseVersionCount={chooseVersionCount} advancedOptions={advancedOptions} setAdvancedOption={setAdvancedOption} premiumAccess={premiumAccess} openMember={() => setModal("member")} generate={generate} generating={generating} results={results} error={generationError} engineLabel={engineLabel} receipt={generationReceipt} updateResult={updateResultAt} copy={copy} favorite={favorite} refine={refineResult} exportResults={exportResults} share={() => setModal("share")} />}
      {page === "tools" && <ToolsPage tool={tool} setTool={chooseTool} text={toolText} setText={setToolText} result={toolResult} error={toolError} run={runTool} generating={generating} copy={copy} intensity={toolIntensity} setIntensity={setToolIntensity} preference={toolPreference} setPreference={setToolPreference} inputLimit={premiumAccess ? MEMBERSHIP_TIERS.member.inputChars : MEMBERSHIP_TIERS.free.inputChars} engineLabel={engineLabel} receipt={toolReceipt} />}
      {page === "library" && <LibraryPage search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} groups={groups} scenes={shownScenes} chooseScene={chooseScene} copy={copy} />}
      {page === "history" && <HistoryPage history={history} setHistory={setHistory} copy={copy} choose={(d: Draft) => {
        const context = (d.batchId ? history.find(item => item.batchId === d.batchId && (item.topic || item.details)) : null) || d;
        const s = scenes.find(x => x.name === d.scene) || scenes[0];
        setScene(s);
        setTopic(context.topic || d.title.replace(/ · 版本\d+$/, ""));
        setDetails(context.details || "");
        setAudience(context.audience || "");
        setPurpose(context.purpose || "");
        setRequirements(context.requirements || "");
        if (context.style) setStyle(context.style);
        if (context.length) setLength(context.length);
        setResults([d.content]);
        setPage("create");
      }} />}
      {page === "updates" && <UpdatesPanel />}
      <footer className="site-footer"><span>妙笔AI · AI 生成内容请人工核对后使用</span><div><button onClick={() => setPage("updates")}>更新日志</button>{isStaticMode() ? <button onClick={() => setModal("legal")}>服务、隐私与退款说明</button> : <a href="/legal">服务、隐私与退款说明</a>}<a href="/admin">站长登录</a></div></footer>
    </main>

    <div className="mobile-dock">
      <nav className="mobile-nav" aria-label="手机主导航">{nav.map(([id, icon, label]) => <button key={id} aria-current={page === id ? "page" : undefined} className={page === id ? "active" : ""} onClick={() => setPage(id)}><span>{icon}</span>{label}</button>)}</nav>
      {account.signedIn
        ? <button className="mobile-account-entry signed-in" onClick={() => setModal("profile")} aria-label="打开我的账号"><span>{account.name?.slice(0, 1) || "我"}</span><small>我的</small></button>
        : <a className="mobile-account-entry" href={signInHref} aria-label="登录或注册"><span>♙</span><small>登录</small></a>}
    </div>
    {toast && <div className="toast" role="status" aria-live="polite">✓ {toast}</div>}
    {modal && <Modal type={modal} close={() => setModal(null)} account={account} copy={copy} />}
  </div>;
}

function HomePage({ setPage, chooseScene, topic, setTopic, style, setStyle, generate, generating, openMember, premiumAccess }: any) {
  const [inspiration, setInspiration] = useState<Inspiration>(() => composeInspiration([0, 0, 0, 0, 0, 0, 0]));
  const [greeting, setGreeting] = useState("你好");
  useEffect(() => { const timer = setTimeout(() => setInspiration(nextInspiration()), 0); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    const hour = new Date().getHours();
    const timer = setTimeout(() => setGreeting(hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好"), 0);
    return () => clearTimeout(timer);
  }, []);
  const inputLimit = premiumAccess ? MEMBERSHIP_TIERS.member.inputChars : MEMBERSHIP_TIERS.free.inputChars;
  return <div className="page home-page">
    <section className="greeting reveal"><div><h1>{greeting}，今天想写点什么？</h1><p>先识别场景，再由 DeepSeek 基于真实素材起稿</p></div><span className="daily-chip"><i>NEW</i> DeepSeek 专线</span></section>
    <section className="quick-layout reveal delay-1">
      <div className="quick-card">
        <div className="section-title"><h2>快速创作</h2><span>自动识别场景 · 只用已知事实</span></div>
        <textarea value={topic} maxLength={inputLimit} onChange={e => setTopic(e.target.value)} placeholder="输入主题和已知事实，例如：帮我写周末露营朋友圈，和两位朋友去了怀柔，只想记录日落…" />
        <small className="input-counter">{topic.length.toLocaleString()} / {inputLimit.toLocaleString()} 字</small>
        <div className="composer-bar">
          <div className="select-row">
            <button onClick={() => setPage("library")}>▦ 选择场景⌄</button>
            <select value={style} onChange={e => setStyle(e.target.value)} aria-label="选择风格">{WRITING_STYLE_OPTIONS.map(item => <option key={item}>{item}</option>)}</select>
            <span className="versions">▱ {premiumAccess ? "会员 6 个版本" : "访客 3 个版本"}</span>
          </div>
          <button className="primary" onClick={generate} disabled={generating}>{generating ? <><i className="spinner"/> 正在创作</> : <>立即生成 <b>✦</b></>}</button>
        </div>
        <p className="quick-style-explain">当前风格会真实执行：{WRITING_STYLE_PROFILES[style as keyof typeof WRITING_STYLE_PROFILES]?.instruction || WRITING_STYLE_PROFILES.自然松弛.instruction}</p>
      </div>
      <aside className="inspire-card">
        <div className="section-title"><h2>今日灵感</h2><button onClick={() => setInspiration(nextInspiration())}>换一换 ↻</button></div>
        <blockquote>“{inspiration.text}”</blockquote>
        <span>{inspiration.category} · {inspiration.tag} · 智能去重</span>
        <div className="paper-art"><i/><i/><i/><b>✦</b></div>
      </aside>
    </section>
    <section className="popular reveal delay-2"><div className="section-heading"><div><h2>热门场景</h2><p>为你精选高频创作模板</p></div><button onClick={() => setPage("library")}>查看全部 {scenes.length} 个场景 →</button></div>
      <div className="scene-grid">{scenes.slice(0,6).map((s, i) => <button className={`scene-card ${i===0?'selected':''}`} key={s.id} onClick={() => chooseScene(s)}><span className={`scene-icon ${s.color}`}>{s.icon}</span><h3>{s.name}</h3><p>{s.desc}</p><b>→</b></button>)}</div>
    </section>
    <section className="update-peek" aria-label="最新更新"><div><span>{latestChangelog.version}</span><p><b>{latestChangelog.title}</b><small>{latestChangelog.date} · {latestChangelog.summary}</small></p></div><button onClick={() => setPage("updates")}>查看全部更新 →</button></section>
    <section className="mini-banner"><div><span>♛</span><p><b>{premiumAccess ? "会员效率权益已生效" : "访客与会员均由同一 DeepSeek 质量链路生成"}</b><small>访客每 24 小时 10 次；会员 100 次 · 6 个版本 · 12,000 字 · 高级控制 · 整组导出</small></p></div><button onClick={openMember}>{premiumAccess ? "查看我的权益" : "对比免费与会员"}</button></section>
  </div>;
}

function CreatePage({ scene, setScene, topic, setTopic, details, setDetails, audience, setAudience, purpose, setPurpose, requirements, setRequirements, style, setStyle, length, setLength, versionCount, chooseVersionCount, advancedOptions, setAdvancedOption, premiumAccess, openMember, generate, generating, results, error, engineLabel, receipt, updateResult, copy, favorite, refine, exportResults, share }: any) {
  const relatedScenes = [scene, ...scenes.filter(item => item.group === scene.group && item.id !== scene.id)].slice(0, 6);
  const materialFields = [topic, details, audience, purpose, requirements].filter(value => String(value || "").trim()).length;
  const materialLength = [topic, details, audience, purpose, requirements].reduce((total, value) => total + String(value || "").length, 0);
  const inputLimit = premiumAccess ? MEMBERSHIP_TIERS.member.inputChars : MEMBERSHIP_TIERS.free.inputChars;
  const overLimit = materialLength > inputLimit;
  const completeness = materialFields * 20;
  const completenessText = completeness >= 80 ? "素材很完整，可以直接生成" : completeness >= 60 ? "素材基本完整，结果会更贴合" : completeness >= 40 ? "建议再补充受众或具体事实" : "信息较少，结果容易偏通用";
  return <div className="page create-page">
    <div className="page-head"><div><span className={`scene-icon ${scene.color}`}>{scene.icon}</span><div><p>{premiumAccess ? "会员效率模式 · 同一事实质量闸门" : "访客 DeepSeek 模式 · 每 24 小时 10 次"}</p><h1>{scene.name}</h1></div></div><button className="ghost" onClick={openMember}>{premiumAccess ? "♛ 查看会员权益" : "♛ 查看高级权益"}</button></div>
    <div className="workspace">
      <section className="form-panel panel">
        <label>选择创作场景</label><div className="scene-tabs">{relatedScenes.map(s => <button key={s.id} className={scene.id===s.id?'active':''} onClick={() => {setScene(s);}}>{s.name}</button>)}</div>
        <label>{scene.fields[0]} <em>*</em></label><textarea className="large-input" value={topic} maxLength={inputLimit} onChange={e => setTopic(e.target.value)} placeholder={`请填写${scene.fields[0]}，信息越具体，生成效果越好…`} />
        <label>{scene.fields[1]} <span className="field-note">只写真实发生或已经确认的内容</span></label><textarea className="detail-input" value={details} maxLength={inputLimit} onChange={event => setDetails(event.target.value)} placeholder={`补充${scene.fields[1]}，可用分号分隔多个事实（推荐）`} />
        <div className="context-grid">
          <div><label>目标受众</label><input value={audience} maxLength={500} onChange={event => setAudience(event.target.value)} placeholder="例如：北京大学生、新顾客、直属领导" /></div>
          <div><label>写作目的</label><input value={purpose} maxLength={500} onChange={event => setPurpose(event.target.value)} placeholder="例如：引导到店、表达感谢、推动确认" /></div>
        </div>
        <label>必须保留 / 不要出现</label><input value={requirements} maxLength={1000} onChange={event => setRequirements(event.target.value)} placeholder="例如：保留价格与日期；不要夸大，不要网络流行语" />
        <div className={`material-quality ${overLimit ? "over-limit" : ""}`} aria-label={`素材完整度 ${completeness}%`}><div><b>素材完整度 {completeness}%</b><span>{overLimit ? `素材共 ${materialLength.toLocaleString()} 字，超过当前 ${inputLimit.toLocaleString()} 字上限` : `${completenessText} · ${materialLength.toLocaleString()} / ${inputLimit.toLocaleString()} 字`}</span></div><i><span style={{ width: `${Math.min(100, completeness)}%` }} /></i></div>
        <div className="form-grid"><div><label>文案风格</label><select value={style} onChange={e => setStyle(e.target.value)}>{WRITING_STYLE_OPTIONS.map(item => <option key={item}>{item}</option>)}</select><small className="control-explain">{WRITING_STYLE_PROFILES[style as keyof typeof WRITING_STYLE_PROFILES]?.summary || WRITING_STYLE_PROFILES.自然松弛.summary}</small></div><div><label>内容长度</label><select value={length} onChange={e => setLength(e.target.value)}><option>简短 · 60—100字</option><option>标准 · 150—300字</option><option>详细 · 素材充足时300—600字</option></select><small className="control-explain">生成接口会按所选字数范围约束每个版本</small></div></div>
        <div className="version-control"><label>单次生成版本</label><div><button className={versionCount === 3 ? "active" : ""} onClick={() => chooseVersionCount(3)}>3 个</button><button className={versionCount === 6 ? "active premium" : "premium"} onClick={() => chooseVersionCount(6)}>6 个 <span>♛</span></button></div></div>
        <div className="quality-guards"><span>✓ 只用已知事实</span><span>✓ 默认去AI套话</span><span>✓ 不补造数字</span></div>
        <div className="advanced-heading"><label>会员高级控制</label>{!premiumAccess && <button onClick={openMember}>解锁权益 →</button>}</div>
        <div className="tone-row"><button className={advancedOptions.emoji && premiumAccess ? "active" : ""} onClick={() => setAdvancedOption("emoji")}>Emoji {premiumAccess ? "" : "♛"}</button><button className={advancedOptions.autoFormat && premiumAccess ? "active" : ""} onClick={() => setAdvancedOption("autoFormat")}>自动排版 {premiumAccess ? "" : "♛"}</button><button className={advancedOptions.riskGuard && premiumAccess ? "active" : ""} onClick={() => setAdvancedOption("riskGuard")}>平台合规 {premiumAccess ? "" : "♛"}</button></div>
        <button className="primary generate-wide" onClick={generate} disabled={generating || overLimit}>{generating ? <><i className="spinner"/> 正在核对素材并组织表达…</> : overLimit ? <>请先缩短素材</> : <>✦ 生成 {versionCount} 个不同草稿</>}</button><small className="cost">本次消耗 1 次 · DeepSeek 不可用或质量检查未通过时不扣次数</small>
      </section>
      <section className="result-panel">
        {error && <div className="inline-error" role="alert"><b>本次未生成</b><p>{error}</p><small>质量检查未通过或服务异常时不会扣次数；可补充真实素材、降低处理强度后重试。</small></div>}
        {!results.length && !generating && !error && <div className="empty-result"><div className="magic-orb">✦</div><h2>成品质量，先取决于素材质量</h2><p>主题、真实细节、受众和目的越明确，结果越不像通用模板<br/>系统不会为了凑字数补造数据或经历</p><div><span>✓ 事实边界检查</span><span>✓ 场景专属结构</span><span>✓ 不同角度版本</span></div></div>}
        {generating && !results.length && <div className="loading-result" aria-live="polite"><div className="magic-orb pulse">✦</div><h2>正在创作…</h2><p>理解场景 · 提取事实 · 组织结构 · 清理套话</p><div className="progress"><i/></div></div>}
        {!!results.length && <div className="results" aria-live="polite"><div className="result-top"><div><h2>{generating ? "正在优化当前结果…" : `已生成 ${results.length} 个不同版本`}</h2><p>所有版本均已保存；下方回执显示本次接口实际采用的控制项</p></div><div className="result-top-actions"><button className="ghost export" onClick={exportResults}>{premiumAccess ? "↓ 整组导出" : "♛ 整组导出"}</button><button className="ghost" onClick={generate} disabled={generating}>↻ 再生成一组</button></div></div>{results.map((r:string,i:number)=><article className="result-card" key={i}><div className="result-meta"><div><b>版本 {i+1}</b><span>{engineLabel}</span></div><small className="control-receipt">{receipt?.style || style} · {receipt?.length || length}{receipt?.intensity ? ` · ${receipt.intensity}` : ""}</small></div><textarea value={r} aria-label={`版本 ${i + 1} 内容`} onChange={event => updateResult(i, event.target.value)}/><div className="result-actions"><button onClick={()=>refine(i,"natural")} disabled={generating}>去AI味</button><button onClick={()=>refine(i,"shorten")} disabled={generating}>精简</button><button onClick={()=>favorite(r)}>♡ 收藏</button><button onClick={()=>share()}>分享网站</button><button onClick={()=>copy(r)} className="copy-btn">复制文案</button></div></article>)}</div>}
      </section>
    </div>
  </div>;
}

function ToolsPage({ tool, setTool, text, setText, result, error, run, generating, copy, intensity, setIntensity, preference, setPreference, inputLimit, engineLabel, receipt }: any) {
  if (tool) {
    const preferenceRule = normalizeToolPreference(tool, preference);
    const intensityRule = toolIntensityInstruction(tool, intensity);
    return <div className="page"><div className="page-head"><div><button className="back" onClick={()=>setTool(null)}>←</button><div><p>保留原意与事实 · 不擅自补写</p><h1>{tool}</h1></div></div><button className="ghost" onClick={()=>setTool(null)}>返回工具箱</button></div><div className="tool-workspace"><section className="panel"><label htmlFor="tool-source">粘贴需要处理的文字</label><textarea id="tool-source" className="tool-input" value={text} maxLength={inputLimit} onChange={e=>setText(e.target.value)} placeholder="在这里输入或粘贴完整原文；专有名词、数字和不能修改的部分请保留在原文中…"/><small className="input-counter">{text.length.toLocaleString()} / {Number(inputLimit).toLocaleString()} 字</small><div className="tool-preference"><label htmlFor="tool-preference">输出偏好</label><select id="tool-preference" value={preference} onChange={event=>setPreference(event.target.value)}>{preferencesForTool(tool).map(item=><option key={item}>{item}</option>)}</select></div><p className="control-explain">{preferenceRule.instruction}</p><div className="tool-options"><label>处理强度</label><div>{TOOL_INTENSITIES.map(item=><button type="button" key={item} aria-pressed={intensity===item} className={intensity===item?"active":""} onClick={()=>setIntensity(item)}>{item}</button>)}</div></div><p className="tool-intensity-note">{intensityRule.instruction}</p><button className="primary generate-wide" onClick={run} disabled={generating}>{generating?"正在处理…":`✦ 开始${tool}`}</button></section><section className="panel output-panel"><div className="section-title"><h2>处理结果</h2>{result&&<button onClick={()=>copy(result)}>复制全部</button>}</div>{error&&<div className="inline-error compact" role="alert"><b>本次未生成</b><p>{error}</p><small>未通过质量检查时不会扣次数；请补充原文信息或降低强度后重试。</small></div>}{result?<><small className="output-engine">{engineLabel} · {receipt?.preference || preference} · {receipt?.intensity || intensity}</small><textarea value={result} readOnly/></>:!error&&<div className="output-empty">处理后的内容会显示在这里</div>}</section></div></div>;
  }
  return <div className="page"><div className="title-row"><div><h1>文本工具箱</h1><p>对任意文字进行智能加工，让每一句表达都恰到好处</p></div><span className="badge">9 个实用工具</span></div><div className="tool-grid">{tools.map(t=><button className="tool-card" key={t[0]} onClick={()=>setTool(t[0])}><span>{t[2]}</span><div><h3>{t[0]}</h3><p>{t[1]}</p><small>{t[3]}</small></div><b>→</b></button>)}</div><div className="tip-card"><span>💡</span><div><b>不知道用哪个工具？</b><p>直接粘贴你的文字，妙笔会自动识别问题并推荐最合适的处理方式。</p></div><button onClick={()=>setTool("智能诊断")}>智能诊断</button></div></div>;
}

function LibraryPage({ search, setSearch, filter, setFilter, groups, scenes, chooseScene, copy }: any) {
  return <div className="page"><div className="title-row"><div><h1>灵感素材库</h1><p>{scenes.length} 个逐场景写作结构，不再只换标题套同一模板</p></div><div className="search"><span>⌕</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索模板或场景"/></div></div><div className="filter-row">{groups.map((g:string)=><button key={g} className={filter===g?'active':''} onClick={()=>setFilter(g)}>{g}</button>)}</div><div className="library-grid">{scenes.map((s:Scene)=><article className="template-card" key={s.id}><div className="template-top"><span className={`scene-icon ${s.color}`}>{s.icon}</span><span>{s.group}</span></div><h3>{s.name}</h3><p>{s.desc}</p><div className="template-preview">建议准备：{s.fields[0]}、{s.fields[1]}、目标受众与写作目的。</div><div><button onClick={()=>chooseScene(s)}>立即创作</button><button onClick={()=>copy(`场景：${s.name}\n请准备：${s.fields[0]}、${s.fields[1]}、目标受众、写作目的。`)}>复制素材清单</button></div></article>)}</div><section className="quote-section"><div className="section-heading"><div><h2>今日金句</h2><p>给创作加一点灵感火花</p></div></div><div className="quote-grid">{quoteInspirations.map((item,i)=><button key={item.signature} onClick={()=>copy(item.text)}><span>0{i+1}</span><p>“{item.text}”</p><small>{item.tag} · 点击复制</small></button>)}</div></section></div>;
}

function HistoryPage({ history, setHistory, copy, choose }: any) {
  const [tab,setTab]=useState("全部记录"); const list=tab==="我的收藏"?history.filter((x:Draft)=>x.favorite):history;
  return <div className="page"><div className="title-row"><div><h1>历史与草稿</h1><p>每个生成版本都会保存在当前浏览器，点击可继续编辑</p></div><button className="ghost" onClick={()=>{if(confirm("确定清空当前浏览器中的全部创作记录？此操作无法恢复。")) setHistory([]);}}>清空记录</button></div><div className="history-tabs"><button className={tab==="全部记录"?'active':''} onClick={()=>setTab("全部记录")}>全部记录 <b>{history.length}</b></button><button className={tab==="我的收藏"?'active':''} onClick={()=>setTab("我的收藏")}>我的收藏 <b>{history.filter((x:Draft)=>x.favorite).length}</b></button></div>{list.length?<div className="history-list">{list.map((d:Draft)=><article key={d.id}><button className={`star ${d.favorite?'on':''}`} aria-label={d.favorite?"取消收藏":"收藏"} onClick={()=>setHistory((h:Draft[])=>h.map(x=>x.id===d.id?{...x,favorite:!x.favorite}:x))}>★</button><button className="history-main" aria-label={`继续编辑：${d.title}`} onClick={()=>choose(d)}><span>{d.scene}</span><h3>{d.title}</h3><p>{d.content}</p><small>{relativeTime(d.createdAt)}</small></button><div className="history-actions"><button onClick={()=>copy(d.content)}>复制</button><button onClick={()=>setHistory((h:Draft[])=>h.filter(x=>x.id!==d.id))}>删除</button></div></article>)}</div>:<div className="empty-list"><span>◷</span><h2>这里还没有内容</h2><p>生成后的所有版本都会显示在这里</p></div>}</div>;
}

function UpdatesPanel() {
  return <div className="page updates-panel"><div className="updates-panel-head"><span>CHANGELOG · 公开记录</span><h1>妙笔AI 更新日志</h1><p>每次正式上线都记录新增功能、体验改进和问题修复，所有访客都能查看。</p><a href="/updates">打开可分享的独立更新页 →</a></div><div className="updates-panel-list">{changelog.map(entry => <article className={entry.current ? "current" : ""} key={entry.version}><div><b>{entry.version}</b><time>{entry.date}</time>{entry.current && <span>当前版本</span>}</div><section><h2>{entry.title}</h2><p>{entry.summary}</p><ul>{entry.highlights.slice(0, 4).map(item => <li key={item}>{item}</li>)}</ul>{!!entry.fixes?.length && <details><summary>查看修复与调整</summary><ul>{entry.fixes.map(item => <li key={item}>{item}</li>)}</ul></details>}</section></article>)}</div></div>;
}

function Modal({ type, close, account, copy }: any) {
  const payment = manualPayment();
  const staticMode = isStaticMode();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selectedPlan, setSelectedPlan] = useState("月度会员 · ¥19.9");
  const methods: PaymentMethod[] = payment.methods?.filter(method => method.qr) || (payment.qr ? [{ id: "wechat", name: "微信支付", qr: payment.qr, crop: "wechat" }] : []);
  const [selectedMethodId, setSelectedMethodId] = useState(methods[0]?.id || "");
  const selectedMethod = methods.find(method => method.id === selectedMethodId) || methods[0];
  const plans = [
    { name: "月度会员", price: "19.9", note: "30 天完整会员权益" },
    { name: "年度会员", price: "99", note: "365 天 · 相当于 ¥8.25 / 月", recommended: true },
    { name: "学生特惠", price: "9.9", note: "30 天 · 人工核验学生身份" },
  ];
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    ) || [])];
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => (focusable()[0] || dialogRef.current)?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [close]);
  return <div className="modal-backdrop" onMouseDown={close}>
    <div ref={dialogRef} tabIndex={-1} className={`modal ${type}`} role="dialog" aria-modal="true" aria-label={type === "member" ? "会员与付款" : "妙笔AI弹窗"} onMouseDown={event => event.stopPropagation()}>
      <button className="modal-close" aria-label="关闭弹窗" onClick={close}>×</button>
      {type === "member" && <>
        <span className="modal-icon">♛</span>
        <h2>{account.isMember || account.isAdmin ? "你的会员权益" : "妙笔 AI 会员"}</h2>
        <p>{account.isMember || account.isAdmin ? "6 个版本、长素材和效率工具已为当前账号开放。" : "免费访客与会员都使用 DeepSeek；会员的价值在更高额度、长素材和批量效率。"}</p>
        {!account.signedIn
          ? <p className="payment-warning">请先登录本站再付款，联系站长时提供登录邮箱，核验后才能开通会员。</p>
          : null}
        <div className="member-compare">
          <div className="compare-head"><span>权益</span><b>免费版</b><strong>会员版</strong></div>
          <div><span>滚动 24 小时额度</span><b>10 次</b><strong>100 次</strong></div>
          <div><span>生成与事实检查</span><b>DeepSeek</b><strong>同一质量链路</strong></div>
          <div><span>单次版本</span><b>3 个</b><strong>6 个</strong></div>
          <div><span>输入长度</span><b>4,000 字</b><strong>12,000 字</strong></div>
          <div><span>高级控制</span><b>事实保护</b><strong>事实保护＋3 项控制</strong></div>
          <div><span>历史上限</span><b>30 条</b><strong>100 条</strong></div>
          <div><span>结果导出</span><b>逐条复制</b><strong>整组 TXT</strong></div>
        </div>
        <small className="member-footnote">DeepSeek 接口故障、余额不足或结果未通过质量检查时会明确提示并退还次数，不再使用本地模板冒充生成。</small>
        <div className="plans">{plans.map(plan => {
          const label = `${plan.name} · ¥${plan.price}`;
          return <button key={plan.name} className={`${plan.recommended ? "recommended" : ""} ${selectedPlan === label ? "selected" : ""}`} onClick={() => setSelectedPlan(label)}>
            {plan.recommended && <em>推荐</em>}<b>{plan.name}</b><strong><i>¥</i>{plan.price}</strong><small>{plan.note}</small>
          </button>;
        })}</div>
        {payment.enabled && selectedMethod
          ? <section className="manual-payment">
              <b>当前选择：{selectedPlan}</b>
              <div className="payment-methods" role="tablist" aria-label="付款方式">{methods.map(method => <button type="button" key={method.id} role="tab" aria-selected={method.id === selectedMethod.id} className={method.id === selectedMethod.id ? "active" : ""} onClick={() => setSelectedMethodId(method.id)}>{method.name}</button>)}</div>
              <div className={`payment-qr-crop ${selectedMethod.crop || ""}`}><img src={selectedMethod.qr} alt={`${selectedMethod.name}收款码`}/></div>
              <a className="payment-full-image" href={selectedMethod.qr} target="_blank" rel="noreferrer">查看完整收款截图</a>
              <p>请按所选套餐金额付款，并保存支付凭证。扫码不代表自动开通。</p>
              <small>核对方式：{payment.contact || "请按页面公布的客服方式联系站长"}{payment.note ? ` · ${payment.note}` : ""}</small>
            </section>
          : <button className="primary pay" disabled>等待站长上传收款码</button>}
        <small className="payment-note">个人收款码没有订单回调，权益必须由站长核对真实到账后人工开通；重复付款、金额错误或未开通权益可凭支付记录联系站长处理退款。</small>
      </>}
      {type === "share" && <>
        <div className="share-preview"><span>妙笔AI</span><h2>把真实素材<br/><b>写成好文案。</b></h2><p>43 个场景 · DeepSeek 真实生成</p></div>
        <h3>分享妙笔AI</h3>
        <p>复制网站链接发给朋友；本站不会用虚假的分享奖励诱导传播。</p>
        <div className="share-actions"><button onClick={() => copy(location.href)}>复制网站链接</button></div>
      </>}
      {type === "profile" && <>
        <div className="profile-head">
          <div className="avatar big">{account.name?.slice(0, 1) || "妙"}</div>
          <div><h2>{account.name || "访客"}</h2><p>{account.signedIn ? (account.isMember || account.isAdmin ? "会员高级模式" : "免费标准模式") : "访客可直接使用；登录后可识别会员与站长身份"}</p></div>
        </div>
        <div className="profile-entitlements">
          <span><b>{account.isMember || account.isAdmin ? 6 : 3}</b>单次版本</span>
          <span><b>{account.isMember || account.isAdmin ? "12k" : "4k"}</b>输入字数</span>
          <span><b>{account.isMember || account.isAdmin ? 100 : 10}</b>24 小时额度</span>
        </div>
        {!account.signedIn && <a className="signin-button" href={account.signInPath || (staticMode ? "/login" : "/signin-with-chatgpt?return_to=%2F")}>{staticMode ? "登录 / 注册国内版账号" : "使用 ChatGPT 安全登录"}</a>}
        {account.isAdmin && <a className="profile-row" href="/admin">进入站长运营后台与 DeepSeek 设置 <span>→</span></a>}
      </>}
      {type === "legal" && <div className="legal-content">
        <span className="modal-icon">§</span><h2>服务、隐私与退款说明</h2><p className="legal-updated">更新日期：2026 年 7 月 28 日</p>
        <section><h3>服务范围</h3><p>妙笔AI提供文案生成、改写与结构化写作辅助。DeepSeek 输出可能存在错误、遗漏或不适合特定平台的内容，发布前必须由用户自行核对；不得用于违法、欺诈、侵权或虚假宣传。</p></section>
        <section><h3>会员权益</h3><p>免费访客每个滚动 24 小时可使用 10 次、单次 3 个版本；会员每 24 小时 100 次，并开放 6 个版本、长文输入、高级控制和整组导出。两个等级都通过服务端调用 DeepSeek；接口故障或结果未通过质量检查时不扣次数。</p></section>
        <section><h3>数据与隐私</h3><p>本站会处理匿名额度标识、账号邮箱、所选场景和生成记录，以提供额度、历史与运营统计；生成时，用户提交的主题、素材、受众和要求会发送给 DeepSeek。API Key 只保存在服务端秘密环境或加密存储中，不会进入网页或小程序代码。</p></section>
        <section><h3>人工收款与开通</h3><p>微信、支付宝个人码没有自动支付回调。付款前应确认套餐并保留支付记录，站长核对金额、付款时间和登录邮箱后在运营后台人工开通；不要只凭截图认定到账。</p></section>
        <section><h3>退款处理</h3><p>重复付款、金额错误或付款后未开通权益，可核对到账记录后原路退款；已开通并使用的服务，按未使用天数或未消费权益协商处理。退款与开通均保留操作记录。</p></section>
        <section><h3>联系站长</h3><p>请通过部署方在站点中公布的联系方式联系站长。请勿发送 API Key、银行卡密码、验证码或其他敏感凭据。</p></section>
      </div>}
    </div>
  </div>;
}
