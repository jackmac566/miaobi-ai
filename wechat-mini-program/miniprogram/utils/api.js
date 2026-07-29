const { BASE_URL } = require("../config");

function ensureConfigured() {
  if (!/^https:\/\/[^/]+/i.test(BASE_URL) || BASE_URL.includes("REPLACE_WITH")) {
    throw new Error("请先在 miniprogram/config.js 配置国内版 HTTPS 后端域名");
  }
}

function request(path, options = {}) {
  ensureConfigured();
  const token = wx.getStorageSync("miaobi-session-token") || "";
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL.replace(/\/$/, "")}${path}`,
      method: options.method || "GET",
      data: options.data,
      timeout: options.timeout || 45000,
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
        else reject(new Error(response.data?.error || `请求失败（${response.statusCode}）`));
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络请求失败"));
      },
    });
  });
}

function account() {
  return request("/api/account");
}

function generate(data) {
  return request("/api/generate", { method: "POST", data, timeout: 50000 });
}

async function authenticate(mode, email, password) {
  const result = await request(`/api/auth/${mode}`, { method: "POST", data: { email, password } });
  if (result.sessionToken) wx.setStorageSync("miaobi-session-token", result.sessionToken);
  return result;
}

module.exports = { account, authenticate, generate, request };
