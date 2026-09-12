const apiUrl = document.querySelector("#apiUrl");
const apiKey = document.querySelector("#apiKey");
const status = document.querySelector("#status");

chrome.storage.local.get(
  { apiUrl: "http://localhost:3000", apiKey: "" },
  (values) => {
    apiUrl.value = values.apiUrl;
    apiKey.value = values.apiKey;
  },
);

document.querySelector("#save").addEventListener("click", async () => {
  const normalizedUrl = apiUrl.value.trim().replace(/\/$/, "");
  if (!/^https:\/\//.test(normalizedUrl) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedUrl)) {
    status.textContent = "URL ต้องเป็น HTTPS หรือ localhost";
    return;
  }
  await chrome.storage.local.set({ apiUrl: normalizedUrl, apiKey: apiKey.value.trim() });
  chrome.runtime.sendMessage({ type: "sync-blocklist" }, (result) => {
    status.textContent = result?.ok ? "บันทึกและซิงก์แล้ว" : `บันทึกแล้ว แต่ซิงก์ไม่สำเร็จ: ${result?.message ?? "unknown"}`;
  });
});
