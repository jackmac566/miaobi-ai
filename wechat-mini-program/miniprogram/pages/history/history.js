const history = require("../../utils/history");
Page({
  data: { list: [] },
  onShow() { this.setData({ list: history.list() }); },
  copy(event) { wx.setClipboardData({ data: event.currentTarget.dataset.content }); },
  clear() {
    wx.showModal({ title: "清空历史", content: "记录只保存在当前手机，清空后无法恢复。", success: result => {
      if (result.confirm) { history.clear(); this.setData({ list: [] }); }
    } });
  },
});
