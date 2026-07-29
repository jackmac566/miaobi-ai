const scenes = require("../../data/scenes");
Page({
  data: { keyword: "", scenes },
  search(event) {
    const keyword = event.detail.value.trim().toLowerCase();
    this.setData({ keyword, scenes: scenes.filter(item => `${item.name}${item.desc}`.toLowerCase().includes(keyword)) });
  },
  choose(event) {
    const scene = scenes.find(item => item.id === Number(event.currentTarget.dataset.id));
    wx.setStorageSync("miaobi-selected-scene", scene);
    wx.switchTab({ url: "/pages/create/create" });
  },
});
