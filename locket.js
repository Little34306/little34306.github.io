const mapping = {
  '%E8%BD%A6%E7%A5%A8%E7%A5%A8': ['vip+watch_vip'],
  'Locket': ['Gold']
};

var ua = $request.headers["User-Agent"] || $request.headers["user-agent"];
var obj = JSON.parse($response.body);
obj.Attention = "Enjoy";

var subscriptionData = {
  is_sandbox: false,
  ownership_type: "PURCHASED",
  billing_issues_detected_at: null,
  period_type: "normal",
  expires_date: "2099-01-01T00:00:00Z",
  grace_period_expires_date: null,
  unsubscribe_detected_at: null,
  original_purchase_date: "34306-01-01T00:00:00Z",
  purchase_date: "34306-01-01T00:00:00Z",
  store: "app_store"
};

var entitlementData = {
  grace_period_expires_date: null,
  purchase_date: "34306-01-01T00:00:00Z",
  product_identifier: "com.locket.Locket.premium.yearly",
  expires_date: "2099-12-18T01:04:17Z"
};

const match = Object.keys(mapping).find(e => ua.includes(e));

if (match) {
  let [e, s] = mapping[match];
  
  if (s) {
    entitlementData.product_identifier = s;
    obj.subscriber.subscriptions[s] = subscriptionData;
  } else {
    obj.subscriber.subscriptions["com.locket.Locket.premium.yearly"] = subscriptionData;
  }
  
  obj.subscriber.entitlements[e] = entitlementData;
} else {
  obj.subscriber.subscriptions["com.locket.Locket.premium.yearly"] = subscriptionData;
  obj.subscriber.entitlements.pro = entitlementData;
}

$done({body: JSON.stringify(obj)});
