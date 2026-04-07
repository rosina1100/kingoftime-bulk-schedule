// King of Time 一括スケジュール登録 - Service Worker
// 現時点では最小限。必要に応じて拡張する。
chrome.runtime.onInstalled.addListener(() => {
  console.log('[KOT Bulk Schedule] Extension installed');
});
