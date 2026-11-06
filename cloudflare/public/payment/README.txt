开源仓库不包含任何个人收款码。

启用人工收款只需四步（图片仅保存在本机，永不提交 Git）：

1. 把你的微信收款码保存为 cloudflare/public/payment/wechat.png
2. 把你的支付宝收款码保存为 cloudflare/public/payment/alipay.png
3. 修改上一级目录的 payment-config.js：
   - enabled 改为 true
   - contact 改成你的联系方式（微信 / 邮箱，用于用户发送付款凭证）
   - note 可补充你的核对说明
4. 重新执行 npm run deploy:cloudflare

流程提醒：
- 用户扫码付款后，会把支付截图和登录邮箱发给你的 contact；
- 你在 /admin 后台核对真实到账后，在"用户与会员"里输入该邮箱赠送会员；
- 个人收款码没有支付回调：无法自动确认到账、自动开通或自动退款；
- 请在付款前后保留支付凭证，退款登记走后台"最近人工订单"；
- 个人码有大额/风控限制，收款规模变大后建议申请微信支付商户号
  （需企业/个体工商户主体），再改造成自动回调。
