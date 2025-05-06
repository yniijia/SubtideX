// Enhanced popup functionality with better YouTube detection
document.addEventListener('DOMContentLoaded', function() {
  // DOM elements
  const statusMessage = document.getElementById('status-message');
  const messageText = document.getElementById('message-text');
  const youtubeButton = document.getElementById('youtube-button');
  const extractButton = document.getElementById('extract-button');
  const mainContent = document.getElementById('main-content');
  
  // Log that popup is opened
  console.log('SubtideX: Popup opened');
  
  // Signal to background script that popup is opened
  chrome.runtime.sendMessage({ action: "popupOpened" });
  
  // Handle popup closing
  window.addEventListener('unload', function() {
    chrome.runtime.sendMessage({ action: "popupClosed" });
  });
  
  // Check if we're on YouTube and if it's a video page
  checkCurrentPage();
  
  // YouTube button click handler
  if (youtubeButton) {
    youtubeButton.addEventListener('click', function(e) {
      // Don't open in new tab if we're already on YouTube
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        if (currentTab && currentTab.url && currentTab.url.includes('youtube.com')) {
          e.preventDefault();
          // If we're already on YouTube, just navigate to trending videos
          chrome.tabs.update(currentTab.id, { url: 'https://www.youtube.com/feed/trending' });
          window.close();
        }
      });
    });
  }
  
  // Extract button click handler
  if (extractButton) {
    extractButton.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs.length > 0) {
          const currentTab = tabs[0];
          
          // Show reloading state
          statusMessage.textContent = 'Reloading page...';
          statusMessage.className = 'status-indicator not-ready';
          extractButton.disabled = true;
          
          // Tell the background script to handle the reload-then-extract sequence
          chrome.runtime.sendMessage({
            action: "reloadAndExtract",
            tabId: currentTab.id
          });
          
          // Close the popup - the background script will handle the rest
          setTimeout(() => window.close(), 800);
        }
      });
    });
  }
  
  function showExtractionError(errorMessage) {
    statusMessage.textContent = 'Error communicating with page';
    statusMessage.className = 'status-indicator error';
    extractButton.disabled = false;
    extractButton.textContent = 'Try Again';
    
    // Add error details if available
    if (!document.querySelector('.tip-box')) {
      const tipBox = document.createElement('div');
      tipBox.className = 'tip-box';
      tipBox.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
      tipBox.style.borderLeftColor = 'var(--error)';
      tipBox.innerHTML = `<strong>Error:</strong> ${errorMessage || 'Failed to communicate with the page. Try refreshing.'}`;
      mainContent.insertBefore(tipBox, extractButton);
    }
  }
  
  // Check if current page is YouTube and specifically a video page
  function checkCurrentPage() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      
      if (!currentTab || !currentTab.url) {
        showNotYouTubeState();
        return;
      }
      
      const url = currentTab.url;
      
      // Check if we're on YouTube using a more reliable method
      const urlObj = new URL(url);
      const isYouTubeDomain = ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(urlObj.hostname);
      
      if (isYouTubeDomain) {
        // Check if we're on a video page
        const isWatchPath = urlObj.pathname === '/watch';
        const hasVideoParam = urlObj.searchParams.has('v');
        
        if (isWatchPath && hasVideoParam) {
          showVideoPageState();
        } else {
          showYouTubeNonVideoState();
        }
      } else {
        showNotYouTubeState();
      }
    });
  }
  
  // State: On YouTube video page - ready to extract
  function showVideoPageState() {
    statusMessage.textContent = 'Ready to extract subtitles';
    statusMessage.className = 'status-indicator ready';
    
    messageText.textContent = 'Click the button below to extract and download subtitles from this YouTube video.';
    
    // Hide YouTube button, show extract button
    youtubeButton.style.display = 'none';
    extractButton.style.display = 'inline-flex';
    
    // Listen for messages from content script
    setupContentScriptListener();
  }
  
  // State: On YouTube but not on a video page
  function showYouTubeNonVideoState() {
    statusMessage.textContent = 'Not on a video page';
    statusMessage.className = 'status-indicator not-ready';
    
    messageText.textContent = 'You are on YouTube, but not on a video page. Navigate to any YouTube video to use SubtideX.';
    
    // Update YouTube button text
    youtubeButton.textContent = 'Browse YouTube Videos';
    youtubeButton.href = 'https://www.youtube.com/feed/trending';
    extractButton.style.display = 'none';
    
    // Create tip box if it doesn't exist
    if (!document.querySelector('.tip-box')) {
      const tipBox = document.createElement('div');
      tipBox.className = 'tip-box';
      tipBox.innerHTML = '<strong>Tip:</strong> This extension works on video pages with URLs containing "youtube.com/watch".';
      
      // Insert before the YouTube button
      mainContent.insertBefore(tipBox, youtubeButton);
    }
  }
  
  // State: Not on YouTube at all
  function showNotYouTubeState() {
    statusMessage.textContent = 'Not on YouTube';
    statusMessage.className = 'status-indicator not-ready';
    
    messageText.textContent = 'Navigate to a YouTube video page to extract subtitles.';
    
    // Update YouTube button
    youtubeButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
      </svg>
      Go to YouTube
    `;
    youtubeButton.href = 'https://www.youtube.com';
    extractButton.style.display = 'none';
  }
  
  // Listen for messages from content script
  function setupContentScriptListener() {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
      console.log("SubtideX popup received message:", message.action);
      
      if (message.action === "extractionProgress") {
        // Update progress in the popup if it's still open
        statusMessage.textContent = `Extracting: ${message.progress}%`;
      } else if (message.action === "downloadSuccess") {
        // Show success message
        statusMessage.textContent = 'Subtitles downloaded successfully!';
        statusMessage.className = 'status-indicator ready';
        extractButton.disabled = false;
        extractButton.textContent = 'Extract Again';
      } else if (message.action === "error") {
        // Show error message
        statusMessage.textContent = message.error || 'Error extracting subtitles';
        statusMessage.className = 'status-indicator error';
        extractButton.disabled = false;
        extractButton.textContent = 'Try Again';
      }
      
      // Always return true for async response
      return true;
    });
  }
  
  // Alternative hardcore reload method
  function forceReload(tabId) {
    // First execute script to clear cache
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: () => {
        // Force a hard reload by running JavaScript in the page
        window.location.href = window.location.href + (window.location.href.includes('?') ? '&' : '?') + 'forceReload=' + Date.now();
      }
    });
  }
}); 