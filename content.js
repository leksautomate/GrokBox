// GrokBox - Content Script

(function () {
  'use strict';

  // Track processed videos and selections
  const processedVideos = new WeakSet();
  let allDetectedVideos = new Map(); // url -> {url, timestamp, thumbnail}
  let selectedVideos = new Map(); // url -> {url, timestamp, element}
  let observerStarted = false;

  // Initialize
  function init() {
    setupMessageListener();
    // Auto-detect videos on page load
    observeVideos();
    scanForVideos();
  }

  // Observe DOM for new video elements
  function observeVideos() {
    if (observerStarted) return;
    observerStarted = true;

    const observer = new MutationObserver((mutations) => {
      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }
      if (hasNewNodes) {
        scanForVideos();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Scan page for video elements
  function scanForVideos() {
    const videos = document.querySelectorAll('video');
    const newVideos = [];

    videos.forEach(video => {
      if (processedVideos.has(video)) return;

      const src = getVideoSource(video);
      if (!src) return;

      processedVideos.add(video);
      addOverlay(video, src);

      const videoData = {
        url: src,
        timestamp: Date.now(),
        thumbnail: getVideoThumbnail(video)
      };

      allDetectedVideos.set(src, videoData);
      newVideos.push(videoData);
    });

    // Notify background of new videos
    if (newVideos.length > 0) {
      try {
        chrome.runtime.sendMessage({
          type: 'VIDEOS_DETECTED',
          videos: newVideos
        }).catch(() => { });
      } catch (e) {
        // Extension context invalidated - silently ignore
      }
    }
  }

  // Get video thumbnail
  function getVideoThumbnail(video) {
    if (video.poster) return video.poster;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 120;
      canvas.height = 68;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      return null;
    }
  }

  // Get video source URL
  function getVideoSource(video) {
    // Check src attribute
    if (video.src && video.src.startsWith('http')) {
      return video.src;
    }

    // Check source elements
    const source = video.querySelector('source');
    if (source && source.src && source.src.startsWith('http')) {
      return source.src;
    }

    // Check currentSrc
    if (video.currentSrc && video.currentSrc.startsWith('http')) {
      return video.currentSrc;
    }

    return null;
  }

  // Add checkbox overlay to video
  function addOverlay(video, url) {
    // Find the video container (usually the parent with relative positioning)
    let container = video.parentElement;
    while (container && getComputedStyle(container).position === 'static') {
      container = container.parentElement;
    }
    if (!container) container = video.parentElement;

    // Ensure container has relative positioning for absolute overlay
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'grok-dl-overlay';
    overlay.innerHTML = `
      <label class="grok-dl-checkbox-wrap">
        <input type="checkbox" class="grok-dl-checkbox" data-url="${encodeURIComponent(url)}">
        <span class="grok-dl-checkmark"></span>
      </label>
    `;

    const checkbox = overlay.querySelector('.grok-dl-checkbox');

    // Check if already selected
    if (selectedVideos.has(url)) {
      checkbox.checked = true;
      overlay.classList.add('selected');
    }

    // Handle selection
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const videoUrl = decodeURIComponent(checkbox.dataset.url);

      if (checkbox.checked) {
        const videoData = allDetectedVideos.get(videoUrl) || {
          url: videoUrl,
          timestamp: Date.now(),
          thumbnail: getVideoThumbnail(video)
        };

        selectedVideos.set(videoUrl, {
          ...videoData,
          element: video
        });
        overlay.classList.add('selected');
      } else {
        selectedVideos.delete(videoUrl);
        overlay.classList.remove('selected');
      }

      notifySidepanel();
    });

    // Prevent video click when clicking checkbox
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    container.appendChild(overlay);
  }

  // Deselect a video by URL
  function deselectVideo(url) {
    selectedVideos.delete(url);

    // Update checkbox if visible
    const checkbox = document.querySelector(`.grok-dl-checkbox[data-url="${encodeURIComponent(url)}"]`);
    if (checkbox) {
      checkbox.checked = false;
      checkbox.closest('.grok-dl-overlay').classList.remove('selected');
    }

    notifySidepanel();
  }

  // Clear all selections
  function clearAllSelections() {
    selectedVideos.clear();

    document.querySelectorAll('.grok-dl-checkbox:checked').forEach(cb => {
      cb.checked = false;
      cb.closest('.grok-dl-overlay').classList.remove('selected');
    });

    notifySidepanel();
  }

  // Clear everything - videos and selections
  function clearEverything() {
    // Clear selections
    selectedVideos.clear();

    // Clear detected videos
    allDetectedVideos.clear();

    // Remove all overlays from page
    document.querySelectorAll('.grok-dl-overlay').forEach(overlay => {
      overlay.remove();
    });

    // Reset processed videos tracking (can't clear WeakSet, but we removed overlays)
    notifySidepanel();
  }

  // Set selection from sidepanel (without triggering sync back)
  function setSelectionFromSidepanel(urls) {
    // Clear current selection UI
    document.querySelectorAll('.grok-dl-checkbox:checked').forEach(cb => {
      cb.checked = false;
      cb.closest('.grok-dl-overlay').classList.remove('selected');
    });

    // Clear and rebuild selected videos
    selectedVideos.clear();

    // Add new selections
    urls.forEach(url => {
      const videoData = allDetectedVideos.get(url) || {
        url: url,
        timestamp: Date.now()
      };
      selectedVideos.set(url, videoData);

      // Update checkbox UI
      const checkbox = document.querySelector(`.grok-dl-checkbox[data-url="${encodeURIComponent(url)}"]`);
      if (checkbox) {
        checkbox.checked = true;
        checkbox.closest('.grok-dl-overlay').classList.add('selected');
      }
    });
    // Don't call notifySidepanel() here to avoid loop
  }

  // Notify sidepanel of selection changes
  function notifySidepanel() {
    try {
      const selectedArray = Array.from(selectedVideos.values()).map(v => {
        const { element, ...safeData } = v;
        return safeData;
      });

      chrome.runtime.sendMessage({
        type: 'SELECTION_CHANGED',
        selected: Array.from(selectedVideos.keys()),
        selectedVideos: selectedArray
      }).catch(() => { });
    } catch (e) {
      // Extension context invalidated - silently ignore
    }
  }

  // Message listener for communication with sidepanel/background
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.type) return false;

      switch (message.type) {
        case 'GET_ALL_VIDEOS':
          sendResponse({
            videos: Array.from(allDetectedVideos.values()),
            selected: Array.from(selectedVideos.keys())
          });
          return true;

        case 'GET_SELECTED':
          sendResponse({
            selected: Array.from(selectedVideos.values())
          });
          return true;

        case 'SELECT_VIDEO':
          if (selectedVideos.has(message.url)) {
            deselectVideo(message.url);
          } else {
            const videoData = allDetectedVideos.get(message.url) || {
              url: message.url,
              timestamp: Date.now()
            };
            selectedVideos.set(message.url, videoData);
            const checkbox = document.querySelector(`.grok-dl-checkbox[data-url="${encodeURIComponent(message.url)}"]`);
            if (checkbox) {
              checkbox.checked = true;
              checkbox.closest('.grok-dl-overlay').classList.add('selected');
            }
          }
          notifySidepanel();
          sendResponse({ success: true });
          return true;

        case 'CLEAR_SELECTION':
          clearAllSelections();
          sendResponse({ success: true });
          return true;

        case 'CLEAR_ALL':
          clearEverything();
          sendResponse({ success: true });
          return true;

        case 'SET_SELECTION':
          // Set selection without triggering sync back
          setSelectionFromSidepanel(message.urls || []);
          sendResponse({ success: true });
          return true;

        case 'SCAN_VIDEOS':
          // Start observing if not already
          observeVideos();
          // Scan current page
          scanForVideos();
          sendResponse({ count: allDetectedVideos.size, videos: Array.from(allDetectedVideos.values()) });
          return true;

        default:
          return false;
      }
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
