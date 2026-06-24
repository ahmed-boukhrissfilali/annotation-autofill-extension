// Service worker: handles French→Arabic translation via MyMemory API
// (content scripts delegate here to avoid page CSP restrictions)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'TRANSLATE_FR_AR') return;

  const url = 'https://api.mymemory.translated.net/get?q=' +
              encodeURIComponent(msg.text) + '&langpair=fr|ar';

  fetch(url)
    .then(r => r.json())
    .then(data => {
      const translated = (data.responseStatus === 200)
        ? data.responseData.translatedText
        : msg.text;
      sendResponse({ translated });
    })
    .catch(() => sendResponse({ translated: msg.text }));

  return true; // keep message channel open for async response
});
