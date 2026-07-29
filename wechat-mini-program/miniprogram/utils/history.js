const KEY = "miaobi-mini-history";

function list() {
  return wx.getStorageSync(KEY) || [];
}

function add(items) {
  wx.setStorageSync(KEY, [...items, ...list()].slice(0, 100));
}

function clear() {
  wx.removeStorageSync(KEY);
}

module.exports = { add, clear, list };
