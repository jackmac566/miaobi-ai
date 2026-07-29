const api = require("../../utils/api");
Page({
  data: { mode: "login", email: "", password: "", account: null, busy: false, error: "", message: "" },
  onShow() { this.load(); },
  async load() {
    try { this.setData({ account: await api.account(), error: "" }); }
    catch (error) { this.setData({ error: error.message }); }
  },
  mode(event) { this.setData({ mode: event.currentTarget.dataset.mode, error: "", message: "" }); },
  field(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  async submit() {
    this.setData({ busy: true, error: "", message: "" });
    try {
      await api.authenticate(this.data.mode, this.data.email, this.data.password);
      this.setData({ message: this.data.mode === "register" ? "注册成功，已登录" : "登录成功", password: "" });
      await this.load();
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ busy: false }); }
  },
  logout() { wx.removeStorageSync("miaobi-session-token"); this.setData({ account: null, message: "已退出" }); this.load(); },
});
