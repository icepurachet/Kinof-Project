const BLOCKLIST_ALARM = "kinof-blocklist-sync";

async function settings() {
  return chrome.storage.local.get({
    apiUrl: "http://localhost:3000",
    apiKey: "",
  });
}

async function api(path, options = {}) {
  const { apiUrl, apiKey } = await settings();
  if (!apiKey) throw new Error("ยังไม่ได้ตั้งค่า Agent API key");
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Agent-Key": apiKey,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`KINOF API ${response.status}`);
  return response.json();
}

async function reportDomain(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  const domain = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!domain) return;
  await api("/agent/events", {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          event_id: crypto.randomUUID(),
          event_type: "website",
          name: domain,
          domain,
          occurred_at: new Date().toISOString(),
          metadata: { source: "kinof-browser-extension" },
        },
      ],
    }),
  });
}

async function syncBlocklist() {
  const rules = await api("/agent/blocklist");
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const blockRules = rules
    .filter((rule) => rule.action === "block")
    .slice(0, 4000)
    .map((rule, index) => ({
      id: index + 1,
      priority: rule.severity === "critical" ? 3 : rule.severity === "high" ? 2 : 1,
      action: { type: "block" },
      condition: {
        urlFilter: `||${rule.domain_name}^`,
        resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest"],
      },
    }));
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((rule) => rule.id),
    addRules: blockRules,
  });
  await chrome.storage.local.set({ lastBlocklistSync: new Date().toISOString() });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(BLOCKLIST_ALARM, { periodInMinutes: 5 });
  syncBlocklist().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BLOCKLIST_ALARM) syncBlocklist().catch(() => {});
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) reportDomain(details.url).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "sync-blocklist") return false;
  syncBlocklist()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, message: error.message }));
  return true;
});
