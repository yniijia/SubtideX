// Background script for SubtideX extension
console.log("SubtideX: Background script loaded - v1.1.1");

// Global state
let currentTabId = null;
let isProcessing = false;
let lastVideoId = null;

// Track popup state
let popupState = {
  isShowing: false
};

// Listen for tab updates to monitor YouTube navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only process if the URL has changed and it's complete
  if (changeInfo.status === 'complete' && tab.url) {
    const isYouTubeVideoPage = isYouTubeVideo(tab.url);
    
    // If we're on a YouTube video page
    if (isYouTubeVideoPage) {
      // Extract video ID
      const videoId = extractVideoId(tab.url);
      
      // If it's a new video (not the same as last time)
      if (videoId && videoId !== lastVideoId) {
        lastVideoId = videoId;
        currentTabId = tabId;
        
        // Notify content script about the page change
        chrome.tabs.sendMessage(tabId, { action: "pageUpdated", isVideoPage: true, videoId: videoId })
          .catch(error => {
            // This will happen if the content script isn't loaded yet, which is normal
            console.log("SubtideX: Content script not ready yet, will try again later");
          });
      }
    } else if (tab.url.includes('youtube.com')) {
      // We're on YouTube but not a video page
      lastVideoId = null;
      currentTabId = tabId;
      
      // Notify content script
      chrome.tabs.sendMessage(tabId, { action: "pageUpdated", isVideoPage: false })
        .catch(error => {
          // This is expected if the content script isn't ready
          console.log("SubtideX: Content script not ready yet on non-video page");
        });
    }
  }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("SubtideX: Received message:", message.action);
  
  try {
    switch (message.action) {
      case "startExtraction":
        handleStartExtraction(sender, sendResponse);
        break;
        
      case "downloadCSV":
        handleDownloadCSV(message, sender, sendResponse);
        break;
        
      case "checkYouTubeVideo":
        handleCheckYouTubeVideo(sender.tab, sendResponse);
        break;
        
      case "popupOpened":
        popupState.isShowing = true;
        break;
        
      case "popupClosed":
        popupState.isShowing = false;
        break;
        
      case "debugInfo":
        console.log("SubtideX Debug:", message.info);
        break;
        
      case "error":
        console.error("SubtideX Error:", message.error, message.context || "");
        break;
        
      case "reloadAndExtract":
        handleReloadAndExtract(message.tabId);
        break;
    }
  } catch (error) {
    console.error("SubtideX: Error handling message:", error, message);
    sendResponse({ status: "error", error: error.message });
  }
  
  // Required for async response
  return true;
});

/**
 * Handles the start extraction message
 */
function handleStartExtraction(sender, sendResponse) {
  if (isProcessing) {
    console.log("SubtideX: Already processing, ignoring duplicate request");
    sendResponse({ status: "busy" });
    return;
  }
  
  isProcessing = true;
  
  // If message came from popup, we need to send a message to the content script
  if (sender.tab === undefined && currentTabId) {
    console.log("SubtideX: Forwarding extraction request to content script");
    
    chrome.tabs.sendMessage(currentTabId, { action: "startExtraction" })
      .then(response => {
        isProcessing = false;
        sendResponse({ status: "started" });
      })
      .catch(error => {
        console.error("SubtideX: Error forwarding extraction request:", error);
        isProcessing = false;
        sendResponse({ status: "error", error: "Failed to communicate with YouTube page" });
      });
  } 
  // If message came from content script, acknowledge receipt
  else if (sender.tab) {
    console.log("SubtideX: Direct extraction request from content script");
    sendResponse({ status: "started" });
    isProcessing = false;
  }
}

/**
 * Handles the download CSV message
 */
function handleDownloadCSV(message, sender, sendResponse) {
  console.log("SubtideX: Preparing to download CSV");
  
  try {
    const csvData = message.data;
    const videoTitle = message.videoTitle || "youtube_subtitles";
    
    // Create a valid filename while preserving case and most characters
    // Only replace characters that are invalid in filenames
    const sanitizedTitle = videoTitle.replace(/[\\/:*?"<>|]/g, '_');
    const filename = `${sanitizedTitle}.csv`;
    
    console.log("SubtideX: Initiating download of:", filename);
    
    // Create a data URI for the CSV content with proper encoding
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvData);
    
    // Use chrome.downloads.download with the data URI
    chrome.downloads.download({
      url: csvContent,
      filename: filename,
      saveAs: true // Let user choose where to save
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("SubtideX: Download error:", chrome.runtime.lastError);
        sendResponse({ status: "error", error: chrome.runtime.lastError.message });
      } else {
        console.log("SubtideX: Download started with ID:", downloadId);
        sendResponse({ status: "success", downloadId: downloadId });
        
        // Send success message back to content script
        if (sender.tab && sender.tab.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            action: "downloadSuccess", 
            downloadId: downloadId
          }).catch(err => {
            console.error("SubtideX: Error sending success message to content script:", err);
          });
        }
        
        // Reset processing flag
        isProcessing = false;
      }
    });
  } catch (error) {
    console.error("SubtideX: Error creating download:", error);
    sendResponse({ status: "error", error: error.message });
    isProcessing = false;
  }
}

/**
 * Handles checking if the current tab is a YouTube video
 */
function handleCheckYouTubeVideo(tab, sendResponse) {
  if (!tab || !tab.url) {
    sendResponse({ isVideoPage: false });
    return;
  }
  
  const isVideoPage = isYouTubeVideo(tab.url);
  const videoId = isVideoPage ? extractVideoId(tab.url) : null;
  
  sendResponse({ 
    isVideoPage: isVideoPage,
    videoId: videoId
  });
}

/**
 * Checks if a URL is a YouTube video page
 */
function isYouTubeVideo(url) {
  if (!url) return false;
  
  // Create URL object to parse the URL
  try {
    const urlObj = new URL(url);
    
    // Must be youtube.com or www.youtube.com or m.youtube.com
    const isYouTubeDomain = ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(urlObj.hostname);
    
    // Must have /watch path
    const isWatchPath = urlObj.pathname === '/watch';
    
    // Must have v parameter
    const hasVideoParam = urlObj.searchParams.has('v');
    
    return isYouTubeDomain && isWatchPath && hasVideoParam;
  } catch (error) {
    console.error("SubtideX: Error parsing URL:", error);
    return false;
  }
}

/**
 * Extracts video ID from YouTube URL
 */
function extractVideoId(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('v');
  } catch (error) {
    console.error("SubtideX: Error extracting video ID:", error);
    return null;
  }
}

function handleReloadAndExtract(tabId) {
  if (!tabId) {
    console.error("SubtideX: No tab ID provided for reload and extract");
    return;
  }
  
  // First get the current URL
  chrome.tabs.get(tabId, (tab) => {
    const currentUrl = tab.url;
    console.log("SubtideX: Processing video at URL:", currentUrl);
    
    // Reload by navigating to the same URL (forces a true reload)
    chrome.tabs.update(tabId, { url: currentUrl }, () => {
      console.log("SubtideX: Tab navigation initiated");
      
      // Set up a listener for when the reload completes
      function onTabUpdated(updatedTabId, changeInfo, tab) {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          console.log("SubtideX: Tab reload completed");
          
          // Remove the listener to avoid multiple calls
          chrome.tabs.onUpdated.removeListener(onTabUpdated);
          
          // Wait a moment for the YouTube player to initialize
          setTimeout(() => {
            console.log("SubtideX: Starting extraction after reload");
            
            // Now start the extraction
            chrome.tabs.sendMessage(tabId, { action: "startExtraction" }, (response) => {
              if (chrome.runtime.lastError) {
                console.error("SubtideX: Error starting extraction after reload:", chrome.runtime.lastError);
                
                // Content script might not be ready, inject it again
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: ['content.js']
                }).then(() => {
                  // Try again after injecting
                  setTimeout(() => {
                    chrome.tabs.sendMessage(tabId, { action: "startExtraction" });
                  }, 500);
                });
              } else {
                console.log("SubtideX: Extraction started after reload:", response);
              }
            });
          }, 2000); // 2 second delay for YouTube player initialization
        }
      }
      
      // Register the listener
      chrome.tabs.onUpdated.addListener(onTabUpdated);
    });
  });
} 