const api = require("../../utils/api");
const history = require("../../utils/history");
const scenes = require("../../data/scenes");

Page({
  data: { scenes, sceneIndex: 0, topic: "", details: "", audience: "", purpose: "", requirements: "", style: "自然", loading: false, results: [], error: "" },
  onShow() {
    const selected = wx.getStorageSync("miaobi-selected-scene");
    if (selected) this.setData({ sceneIndex: Math.max(0, scenes.findIndex(item => item.id === selected.id)) });
  },
  field(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  scene(event) { this.setData({ sceneIndex: Number(event.detail.value), results: [] }); },
  async generate() {
    if (!this.data.topic.trim()) return wx.showToast({ title: "请填写主题", icon: "none" });
    this.setData({ loading: true, error: "", results: [] });
    try {
      const scene = scenes[this.data.sceneIndex];
      const result = await api.generate({ scene: scene.name, topic: this.data.topic, details: this.data.details, audience: this.data.audience, purpose: this.data.purpose, requirements: this.data.requirements, style: this.data.style, versionCount: 3 });
      const now = Date.now();
      history.add(result.results.map((content, index) => ({ id: now + index, title: `${this.data.topic.slice(0, 28)} · 版本${index + 1}`, scene: scene.name, content, createdAt: now })));
      this.setData({ results: result.results });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  copy(event) { wx.setClipboardData({ data: event.currentTarget.dataset.content }); },
});
