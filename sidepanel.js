// GrokBox - Sidepanel Script (Selected Videos Only)

(function () {
  'use strict';

  // State
  let selectedVideos = []; // Array of {url, timestamp, thumbnail}
  let downloadedUrls = new Set();
  let currentTabId = null;

  // DOM Elements
  const elements = {
    selectedCount: document.getElementById('selectedCount'),
    startNumber: document.getElementById('startNumber'),
    downloadBtn: document.getElementById('downloadBtn'),
    clearBtn: document.getElementById('clearBtn'),
    videoList: document.getElementById('videoList'),
    emptyState: document.getElementById('emptyState'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText')
  };

  // Initialize
  async function init() {
    await loadDownloadedUrls();
    setupEventListeners();
    setupMessageListener();
    await getCurrentTab();
    updateStats();
  }

  // Get the current tab
  async function getCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) currentTabId = tab.id;
    } catch (e) { }
  }

  // Load previously downloaded URLs from storage
  async function loadDownloadedUrls() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_DOWNLOADED' });
      if (response && response.urls) {
        downloadedUrls = new Set(response.urls);
      }
    } catch (err) {
      console.log('Could not load downloaded URLs, starting fresh');
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    // Download button
    elements.downloadBtn.addEventListener('click', downloadSelected);

    // Clear button
    elements.clearBtn.addEventListener('click', clearAll);
  }

  // Setup message listener
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'SELECTION_CHANGED':
          if (message.selectedVideos) {
            selectedVideos = message.selectedVideos;
          } else {
            // Fallback: just URLs, no metadata
            selectedVideos = (message.selected || []).map(url => ({
              url,
              timestamp: Date.now()
            }));
          }
          renderVideoList();
          updateStats();
          break;
      }
    });
  }

  // Render video list (selected videos only)
  function renderVideoList() {
    if (selectedVideos.length === 0) {
      elements.videoList.innerHTML = '';
      elements.emptyState.style.display = 'block';
      elements.videoList.appendChild(elements.emptyState);
      return;
    }

    elements.emptyState.style.display = 'none';

    const html = selectedVideos.map((video, index) => {
      const isDownloaded = downloadedUrls.has(video.url);

      return `
        <div class="video-item ${isDownloaded ? 'downloaded' : ''}"
             data-url="${encodeURIComponent(video.url)}">
          <div class="video-thumb">
            ${video.thumbnail
          ? `<img src="${video.thumbnail}" alt="Video thumbnail">`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>`
        }
            ${isDownloaded ? '<span class="downloaded-badge">DL</span>' : ''}
          </div>
          <div class="video-info">
            <div class="video-title">Video ${index + 1}</div>
            <div class="video-meta">${formatTimestamp(video.timestamp)}${isDownloaded ? ' • Downloaded' : ''}</div>
          </div>
          <div class="video-num">${index + 1}</div>
          <button class="video-remove" data-url="${encodeURIComponent(video.url)}" title="Deselect">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      `;
    }).join('');

    elements.videoList.innerHTML = html;

    // Add remove button handlers
    elements.videoList.querySelectorAll('.video-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url = decodeURIComponent(btn.dataset.url);
        await deselectVideoOnPage(url);
      });
    });
  }

  // Deselect a video on the page
  async function deselectVideoOnPage(url) {
    if (!currentTabId) await getCurrentTab();
    if (!currentTabId) return;

    try {
      await chrome.tabs.sendMessage(currentTabId, {
        type: 'SELECT_VIDEO',
        url: url
      });
    } catch (err) {
      // Content script not available - remove locally
      selectedVideos = selectedVideos.filter(v => v.url !== url);
      renderVideoList();
      updateStats();
    }
  }

  // Clear all selections
  async function clearAll() {
    selectedVideos = [];
    renderVideoList();
    updateStats();

    if (!currentTabId) await getCurrentTab();
    if (currentTabId) {
      try {
        await chrome.tabs.sendMessage(currentTabId, { type: 'CLEAR_SELECTION' });
      } catch (err) {
        // Ignore
      }
    }
  }

  // Download selected videos
  async function downloadSelected() {
    if (selectedVideos.length === 0) return;

    const startNum = parseInt(elements.startNumber.value) || 1;

    // Show progress
    elements.progressBar.classList.add('active');
    elements.progressText.textContent = `Downloading 0 of ${selectedVideos.length}...`;
    elements.downloadBtn.disabled = true;

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedVideos.length; i++) {
      const url = selectedVideos[i].url;
      const filename = `${startNum + i}.mp4`;

      elements.progressText.textContent = `Downloading ${i + 1} of ${selectedVideos.length}...`;

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'DOWNLOAD_VIDEO',
          url: url,
          filename: filename
        });

        if (response.success) {
          successCount++;
          downloadedUrls.add(url);
        } else {
          failCount++;
          console.error('Download failed:', response.error);
        }
      } catch (err) {
        failCount++;
        console.error('Download error:', err);
      }

      // Small delay between downloads
      if (i < selectedVideos.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Mark as downloaded in storage
    if (successCount > 0) {
      await chrome.runtime.sendMessage({
        type: 'MARK_DOWNLOADED',
        urls: Array.from(downloadedUrls)
      });
    }

    // Show result
    if (failCount === 0) {
      elements.progressText.textContent = `Downloaded ${successCount} video${successCount > 1 ? 's' : ''}!`;
    } else {
      elements.progressText.textContent = `Downloaded ${successCount}, failed ${failCount}`;
    }

    // Clear selection and hide progress after delay
    setTimeout(() => {
      clearAll();
      elements.progressBar.classList.remove('active');
      elements.downloadBtn.disabled = false;
    }, 2000);
  }

  // Update stats display
  function updateStats() {
    elements.selectedCount.textContent = selectedVideos.length;
    elements.downloadBtn.disabled = selectedVideos.length === 0;
  }

  // Format timestamp for display
  function formatTimestamp(ts) {
    const date = new Date(ts);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString();
  }

  // Start
  init();
})();
