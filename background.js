// GrokBox - Background Service Worker

// Open sidepanel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Store for videos detected across tabs
const tabVideos = new Map();

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'VIDEOS_DETECTED':
      handleVideosDetected(message.videos, sender.tab);
      return false;

    case 'GET_VIDEOS':
      sendResponse({ videos: tabVideos.get(message.tabId) || [] });
      return false;

    case 'DOWNLOAD_VIDEO':
      downloadVideo(message.url, message.filename)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep channel open for async response

    case 'DOWNLOAD_BATCH':
      downloadBatch(message.videos, message.startNumber)
        .then(results => sendResponse({ success: true, results }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'MARK_DOWNLOADED':
      markAsDownloaded(message.urls);
      sendResponse({ success: true });
      return false;

    case 'GET_DOWNLOADED':
      getDownloadedUrls()
        .then(urls => sendResponse({ urls: urls || [] }))
        .catch(() => sendResponse({ urls: [] }));
      return true;

    default:
      return false;
  }
});

// Handle videos detected by content script
function handleVideosDetected(videos, tab) {
  if (!tab) return;

  const existing = tabVideos.get(tab.id) || [];
  const existingUrls = new Set(existing.map(v => v.url));

  const newVideos = videos.filter(v => !existingUrls.has(v.url));
  if (newVideos.length > 0) {
    tabVideos.set(tab.id, [...existing, ...newVideos]);

    // Notify sidepanel of new videos
    chrome.runtime.sendMessage({
      type: 'VIDEOS_UPDATED',
      tabId: tab.id,
      videos: tabVideos.get(tab.id)
    }).catch(() => {}); // Ignore if sidepanel not open
  }
}

// Download a single video
async function downloadVideo(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(downloadId);
      }
    });
  });
}

// Download multiple videos in batch
async function downloadBatch(videos, startNumber = 1) {
  const results = [];
  const downloadedUrls = [];

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const num = startNumber + i;
    const filename = `${num}.mp4`;

    try {
      await downloadVideo(video.url, filename);
      results.push({ url: video.url, success: true, filename });
      downloadedUrls.push(video.url);

      // Small delay between downloads to prevent overwhelming
      if (i < videos.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      results.push({ url: video.url, success: false, error: err.message });
    }
  }

  // Mark all successful downloads
  if (downloadedUrls.length > 0) {
    await markAsDownloaded(downloadedUrls);
  }

  return results;
}

// Mark URLs as downloaded in storage
async function markAsDownloaded(urls) {
  const { downloadedUrls = [] } = await chrome.storage.local.get('downloadedUrls');
  const urlSet = new Set(downloadedUrls);
  urls.forEach(url => urlSet.add(url));
  await chrome.storage.local.set({ downloadedUrls: Array.from(urlSet) });
}

// Get list of previously downloaded URLs
async function getDownloadedUrls() {
  const { downloadedUrls = [] } = await chrome.storage.local.get('downloadedUrls');
  return downloadedUrls;
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabVideos.delete(tabId);
});
