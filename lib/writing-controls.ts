export const WRITING_STYLE_PROFILES = {
  自然松弛: {
    label: "自然松弛",
    summary: "像真人日常表达，轻松但不随便",
    instruction: "使用自然口语和长短句交替，允许适度停顿与留白；少用形容词和总结式升华，不堆网络热词，不写成广告腔。",
  },
  高级感: {
    label: "高级感",
    summary: "克制、精确、有质感",
    instruction: "用词准确克制，句子干净，依靠具体细节和节奏体现质感；不使用“顶级、奢华、尊贵、天花板”等空洞抬高词。",
  },
  文艺治愈: {
    label: "文艺治愈",
    summary: "有画面但不堆砌辞藻",
    instruction: "围绕素材中真实可见的场景、动作或感受营造画面，语气温和；最多使用一处自然比喻，不连续排比，不写万能鸡汤。",
  },
  幽默搞笑: {
    label: "幽默搞笑",
    summary: "轻巧反差，不尴尬硬玩梗",
    instruction: "使用轻微反差、自嘲或意外转折制造笑点，笑点必须服务主题；不冒犯群体，不强塞流行梗，不连续使用感叹号。",
  },
  正式专业: {
    label: "正式专业",
    summary: "结论清楚、结构严谨、可以执行",
    instruction: "结论和目的前置，信息按逻辑分层，使用客观、准确、可执行的表达；不用口头禅、网络梗、Emoji或过度感叹。",
  },
  简洁有力: {
    label: "简洁有力",
    summary: "短句、强动词、没有废话",
    instruction: "每句话只表达一个重点，优先使用明确动词，删除重复铺垫和弱化词；保留必要条件与事实，不为追求短而遗漏关键信息。",
  },
} as const;

export type WritingStyle = keyof typeof WRITING_STYLE_PROFILES;
export const WRITING_STYLE_OPTIONS = Object.freeze(Object.keys(WRITING_STYLE_PROFILES) as WritingStyle[]);
export const DEFAULT_WRITING_STYLE: WritingStyle = "自然松弛";

export const TOOL_INTENSITIES = ["轻度", "标准", "深度"] as const;
export type ToolIntensity = (typeof TOOL_INTENSITIES)[number];

const TOOL_PREFERENCE_RULES: Record<string, Record<string, string>> = {
  智能诊断: {
    综合诊断: "依次检查事实完整性、逻辑顺序、重复空话、语气适配和风险表达；只指出确实存在的问题，再给完整修改稿。",
    重点查套话: "标出具体套话或空泛句，说明其问题，并用与原素材直接相关的具体表达替换。",
    重点查逻辑: "重点检查前后矛盾、因果倒置、信息缺口与段落衔接；先列问题，再按清晰顺序重组。",
  },
  智能润色: {
    自然流畅: "修复生硬、重复和不顺句，让文字像真人自然说写，同时保留原作者语气。",
    正式专业: WRITING_STYLE_PROFILES.正式专业.instruction,
    简洁克制: "删除赘词、重复和夸张修饰，用更短、更准确的句子表达同一信息。",
    口语自然: "改成适合真实对话或口播的表达，允许自然停顿，但不用夸张网络梗。",
  },
  内容改写: {
    自然表达: "重新组织句式，让表达自然顺畅；不能只替换同义词，也不能改变事实和立场。",
    正式表达: WRITING_STYLE_PROFILES.正式专业.instruction,
    口语表达: "改成真人容易说出口的口语，句子不宜过长，保留全部事实与限定条件。",
    重新组织结构: "可调整段落顺序、合并重复信息并补足衔接，但不得增加素材中没有的事实。",
  },
  扩写充实: {
    完善结构: "补全开头、主体、转折和结尾之间的结构关系，信息不足处不编造。",
    补充逻辑: "展开已有观点之间的因果、条件和解释，不新增未经提供的原因或结果。",
    补充表达细节: "只扩展已有场景、动作和已知特征的表达层次，不虚构人物、案例或数据。",
  },
  缩写提炼: {
    核心摘要: "保留核心结论、依据、条件、数字和例外，压缩成一段忠于原文的摘要。",
    一句话总结: "用一句完整的话概括最重要结论；必要限定条件必须保留。",
    要点列表: "按重要性输出精炼要点列表，每一点不重复，数字和专有名词保持原样。",
  },
  多语言翻译: {
    英文: "翻译为自然、准确的英文，保留原文语气、段落、专有名词和所有数字。",
    日文: "翻译为自然、准确的日文，根据使用场景选择得体语体，保留专有名词和所有数字。",
    韩文: "翻译为自然、准确的韩文，根据使用场景选择得体语体，保留专有名词和所有数字。",
    繁体中文: "转换为符合繁体中文使用习惯的文本，只做必要用词调整，不改变原意与事实。",
  },
  纠错校对: {
    "修订稿＋修改说明": "先给完整修订稿，再逐条列出确实修改过的错字、标点、语法、搭配或指代问题及原因。",
    只给修订稿: "只输出校正后的完整文本，不附解释；没有错误的部分尽量保持不变。",
  },
  风格转换: {
    自然口语: WRITING_STYLE_PROFILES.自然松弛.instruction,
    正式专业: WRITING_STYLE_PROFILES.正式专业.instruction,
    温柔真诚: "语气温和直接，把关心落在具体事情上；不替对方下结论，不使用情绪绑架和模板化煽情。",
    幽默克制: WRITING_STYLE_PROFILES.幽默搞笑.instruction,
    文艺简洁: "使用一处具体画面或意象，句子简洁有留白；不堆砌辞藻，不强行升华。",
  },
  标题生成: {
    公众号: "输出10个能被正文兑现的公众号标题，兼顾主题明确和阅读价值，不使用震惊体与虚假悬念。",
    小红书: "输出10个适合小红书的标题，清楚写出对象或体验价值；不冒充亲测，不使用无依据数字和极限词。",
    短视频: "输出10个适合视频封面或开场的短标题，前置冲突、问题或收益，但不夸大结果。",
    电商: "输出10个电商标题，组合真实商品词、属性、规格和适用场景，不堆无关热词。",
  },
  思维导图: {
    文章大纲: "输出文章标题与多级章节结构，每个分支职责明确，顺序符合阅读逻辑。",
    项目拆解: "按目标、任务、依赖、风险和验收拆成可执行层级，不虚构负责人和时间。",
    学习笔记: "按概念、原理、例子、易错点和复习问题组织层级，只使用原文信息。",
    演讲提纲: "按开场、核心观点、论据、过渡和结尾组织，节点适合口头表达。",
  },
};

const TOOL_ALIASES: Record<string, string> = {
  自然化改写: "内容改写",
  精简表达: "缩写提炼",
  爆款标题生成: "标题生成",
  思维导图大纲: "思维导图",
};

export function normalizeWritingStyle(value: unknown): WritingStyle {
  const candidate = String(value || "") as WritingStyle;
  return candidate in WRITING_STYLE_PROFILES ? candidate : DEFAULT_WRITING_STYLE;
}

export function writingStyleInstruction(style: unknown) {
  const normalized = normalizeWritingStyle(style);
  return {
    value: normalized,
    instruction: WRITING_STYLE_PROFILES[normalized].instruction,
  };
}

export function preferencesForTool(tool: string | null | undefined) {
  const normalizedTool = TOOL_ALIASES[String(tool || "")] || String(tool || "");
  return Object.keys(TOOL_PREFERENCE_RULES[normalizedTool] || { 自然表达: "保持自然、准确并忠于原文。" });
}

export function normalizeToolPreference(tool: string | null | undefined, value: unknown) {
  const normalizedTool = TOOL_ALIASES[String(tool || "")] || String(tool || "");
  const rules = TOOL_PREFERENCE_RULES[normalizedTool] || { 自然表达: "保持自然、准确并忠于原文。" };
  const candidate = String(value || "");
  const selected = candidate in rules ? candidate : Object.keys(rules)[0];
  return { value: selected, instruction: rules[selected] };
}

export function normalizeToolIntensity(value: unknown): ToolIntensity {
  return TOOL_INTENSITIES.includes(value as ToolIntensity) ? value as ToolIntensity : "标准";
}

export function toolIntensityInstruction(tool: string | null | undefined, value: unknown) {
  const intensity = normalizeToolIntensity(value);
  const normalizedTool = TOOL_ALIASES[String(tool || "")] || String(tool || "");
  const translation = normalizedTool === "多语言翻译";
  const summary = normalizedTool === "缩写提炼";
  const instruction = intensity === "轻度"
    ? translation
      ? "采用贴近原句结构的准确翻译，只做目标语言必须的语序调整。"
      : summary
        ? "只删除明显重复和次要铺垫，保留原文大部分结构与细节。"
        : "只修改明确错误、明显重复和读起来不顺的局部；未发现问题的句子保持原样，段落顺序不变。"
    : intensity === "深度"
      ? translation
        ? "在准确保留全部事实的前提下，按目标语言母语表达重组句式和语序，使成品适合直接发布。"
        : summary
          ? "大幅压缩到核心结论、依据和必要限定条件；允许重组顺序，但所有关键事实必须保留。"
          : "允许重新安排段落、合并重复信息、拆分长句并重写表达；专有名词、数字、事实、因果和立场必须完整保留。"
      : translation
        ? "在忠实原意的前提下调整句式，使译文自然流畅并符合指定使用场景。"
        : summary
          ? "压缩重复说明并重排重点，保留核心结论、关键事实、数字和例外条件。"
          : "进行句子级润色并优化段内顺序，必要时合并重复句；整体结构、全部事实与原作者立场保持不变。";
  return { value: intensity, instruction };
}

export function appliedControlSummary(input: {
  style?: unknown;
  tool?: string | null;
  preference?: unknown;
  intensity?: unknown;
  length?: unknown;
}) {
  const style = writingStyleInstruction(input.style);
  const preference = normalizeToolPreference(input.tool, input.preference);
  const intensity = toolIntensityInstruction(input.tool, input.intensity);
  return {
    style: style.value,
    styleInstruction: style.instruction,
    preference: input.tool ? preference.value : null,
    preferenceInstruction: input.tool ? preference.instruction : null,
    intensity: input.tool ? intensity.value : null,
    intensityInstruction: input.tool ? intensity.instruction : null,
    length: String(input.length || "标准 · 150—300字"),
  };
}
