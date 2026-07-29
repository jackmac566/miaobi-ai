const api = require("../../utils/api");
const history = require("../../utils/history");

const tools = ["智能润色","内容改写","扩写充实","缩写提炼","多语言翻译","纠错校对","风格转换","标题生成","思维导图"];
Page({
  data: { tools, toolIndex: 0, text: "", result: "", loading: false, error: "" },
  choose(event) { this.setData({ toolIndex: Number(event.detail.value), result: "" }); },
  input(event) { this.setData({ text: event.detail.value }); },
  async run() {
    if (!this.data.text.trim()) return wx.showToast({ title: "请先输入文字", icon: "none" });
    this.setData({ loading: true, error: "", result: "" });
    try {
      const tool = this.data.tools[this.data.toolIndex];
      const response = await api.generate({ tool, topic: this.data.text, style: "自然", intensity: "标准" });
      const result = response.results[0];
      history.add([{ id: Date.now(), title: tool, scene: tool, content: result, createdAt: Date.now() }]);
      this.setData({ result });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  copy() { wx.setClipboardData({ data: this.data.result }); },
});
