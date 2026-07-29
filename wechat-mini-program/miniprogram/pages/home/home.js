const api = require("../../utils/api");
const history = require("../../utils/history");
const scenes = require("../../data/scenes");
const { VERSION } = require("../../config");

Page({
  data: {
    version: VERSION,
    account: { signedIn: false, remaining: 10, isMember: false },
    topic: "",
    loading: false,
    results: [],
    scenes: scenes.slice(0, 6),
    error: "",
  },
  onShow() {
    api.account().then(account => this.setData({ account })).catch(error => this.setData({ error: error.message }));
  },
  input(event) { this.setData({ topic: event.detail.value }); },
  account() { wx.navigateTo({ url: "/pages/account/account" }); },
  choose(event) {
    const scene = scenes.find(item => item.id === Number(event.currentTarget.dataset.id));
    wx.setStorageSync("miaobi-selected-scene", scene);
    wx.switchTab({ url: "/pages/create/create" });
  },
  async generate() {
    if (!this.data.topic.trim()) return wx.showToast({ title: "请先输入主题", icon: "none" });
    this.setData({ loading: true, error: "", results: [] });
    try {
      const result = await api.generate({ scene: "通用文案", topic: this.data.topic, style: "自然" });
      const now = Date.now();
      const records = result.results.map((content, index) => ({ id: now + index, title: this.data.topic.slice(0, 30), scene: "通用文案", content, createdAt: now }));
      history.add(records);
      this.setData({ results: result.results, "account.remaining": result.remaining });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
  copy(event) { wx.setClipboardData({ data: event.currentTarget.dataset.content }); },
});
