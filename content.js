// SubtideX - YouTube Subtitles Extractor
// Enhanced content script with improved video detection and error handling

// Global state
let currentVideoId = null;
let extractionInProgress = false;
let debugMode = false;

// DOM elements and UI references
let loadingIndicator = null;
let notificationElement = null;

// Initialize as soon as the document is ready
initializeContentScript();

/**
 * Main initialization function for the content script
 */
function initializeContentScript() {
  console.log("SubtideX: Content script initialized on:", window.location.href);
  
  // Check if we're on a YouTube video page
  const isVideoPage = checkIfYouTubeVideoPage();
  
  // Register message listeners
  setupMessageListeners();
  
  // Monitor for YouTube SPA navigation (since YouTube doesn't fully reload the page)
  monitorYouTubeURLChanges();
  
  // Send initial status to background script
  if (isVideoPage) {
    const videoId = extractVideoId(window.location.href);
    currentVideoId = videoId;
    
    console.log("SubtideX: Detected YouTube video page with ID:", videoId);
    
    // Send status to background script
    chrome.runtime.sendMessage({
      action: "pageInfo",
      isVideoPage: true,
      videoId: videoId,
      url: window.location.href
    });
  }
}

/**
 * Set up listeners for messages from background script and popup
 */
function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("SubtideX: Content script received message:", message.action);
    
    switch (message.action) {
      case "startExtraction":
        if (!extractionInProgress) {
          extractionInProgress = true;
          sendResponse({ status: "started" });
          extractAndProcessSubtitles();
        } else {
          sendResponse({ status: "busy" });
        }
        break;
        
      case "pageUpdated":
        handlePageUpdate(message, sendResponse);
        break;
        
      case "enableDebug":
        debugMode = true;
        addDebugButton();
        sendResponse({ status: "debug_enabled" });
        break;
        
      case "retryExtraction":
        if (!extractionInProgress) {
          extractionInProgress = true;
          extractAndProcessSubtitles();
          sendResponse({ status: "restarted" });
        } else {
          sendResponse({ status: "busy" });
        }
        break;
    }
    
    // Return true for async response
    return true;
  });
}

/**
 * Handles page update messages from the background script
 */
function handlePageUpdate(message, sendResponse) {
  if (message.isVideoPage && message.videoId) {
    // Update current video ID
    currentVideoId = message.videoId;
    console.log("SubtideX: Page updated to video:", currentVideoId);
    sendResponse({ status: "updated", isVideoPage: true });
  } else {
    // Reset video ID if not on a video page
    currentVideoId = null;
    console.log("SubtideX: Page updated to non-video page");
    sendResponse({ status: "updated", isVideoPage: false });
  }
}

/**
 * Monitors URL changes in YouTube SPA
 */
function monitorYouTubeURLChanges() {
  // YouTube uses History API for navigation
  let lastUrl = window.location.href;
  
  // Function to check for URL changes
  const checkForURLChanges = () => {
    if (window.location.href !== lastUrl) {
      const oldUrl = lastUrl;
      lastUrl = window.location.href;
      
      // Check if the new URL is a video page
      const isVideoPage = checkIfYouTubeVideoPage();
      const newVideoId = isVideoPage ? extractVideoId(window.location.href) : null;
      
      console.log("SubtideX: URL changed from", oldUrl, "to", lastUrl);
      console.log("SubtideX: New page is video?", isVideoPage, "ID:", newVideoId);
      
      // Reset extraction state for new video
      extractionInProgress = false;
      
      // Update global state
      currentVideoId = newVideoId;
      
      // Notify background script about page change
      chrome.runtime.sendMessage({
        action: "pageChanged",
        from: oldUrl,
        to: lastUrl,
        isVideoPage: isVideoPage,
        videoId: newVideoId
      });
    }
  };
  
  // Create a new observer instance to monitor DOM mutations
  const observer = new MutationObserver(checkForURLChanges);
  
  // Start observing document body for DOM changes
  observer.observe(document.body, { subtree: true, childList: true });
  
  // Also check on history changes for SPAs
  window.addEventListener('popstate', checkForURLChanges);
  
  // Check periodically (as a backup)
  setInterval(checkForURLChanges, 1000);
}

async function extractAndProcessSubtitles() {
  // Show loading indicator
  showLoadingIndicator();
  
  try {
    // Check if we're on a video page
    if (!checkIfYouTubeVideoPage()) {
      throw new Error("Not on a YouTube video page");
    }
    
    // Get video title for filename
    const videoTitle = getVideoTitle();
    
    // Get video ID for debugging
    const videoId = extractVideoId(window.location.href);
    console.log(`SubtideX: Extracting subtitles for video ${videoId} - "${videoTitle}"`);
    
    // Access YouTube's subtitle track
    const subtitles = await getYouTubeSubtitles();
    
    if (!subtitles || subtitles.length === 0) {
      throw new Error("No subtitles found for this video");
    }
    
    console.log(`SubtideX: Found ${subtitles.length} subtitle entries`);
    
    // Convert to CSV format
    const csvData = convertToCSV(subtitles);
    
    // Send to background script for download
    chrome.runtime.sendMessage({
      action: "downloadCSV", 
      data: csvData,
      videoTitle: videoTitle
    }, response => {
      if (chrome.runtime.lastError) {
        console.error("SubtideX: Error sending download request:", chrome.runtime.lastError);
        showNotification("Error downloading subtitles. Please try again.", "error");
        extractionInProgress = false;
        return;
      }
      
      if (!response) {
        console.error("SubtideX: No response from background script");
        showNotification("Error: No response from extension. Please reload the page.", "error");
        extractionInProgress = false;
        return;
      }
      
      if (response.status === "error") {
        console.error("SubtideX: Download error:", response.error);
        showNotification(`Error: ${response.error}`, "error");
      } else if (response.status === "success") {
        console.log("SubtideX: Download request sent successfully with ID:", response.downloadId);
        showNotification("Subtitles downloaded successfully!", "success");
      } else {
        console.warn("SubtideX: Unknown response status:", response.status);
        showNotification("Subtitles processed, check your downloads folder.", "info");
      }
      
      // Reset extraction state
      extractionInProgress = false;
    });
  } catch (error) {
    console.error("SubtideX: Error extracting subtitles:", error);
    showNotification(`Error: ${error.message}`, "error");
    
    // Log detailed error for debugging
    chrome.runtime.sendMessage({
      action: "error",
      error: error.message,
      stack: error.stack,
      context: "subtitle_extraction"
    });
    
    // Reset extraction state
    extractionInProgress = false;
  } finally {
    // Always hide loading indicator
    hideLoadingIndicator();
  }
}

/**
 * Get the title of the current YouTube video
 */
function getVideoTitle() {
  // Try different selectors for YouTube's changing UI
  const title = document.querySelector('h1.ytd-watch-metadata')?.textContent.trim() || 
                document.querySelector('.title')?.textContent.trim() || 
                document.querySelector('h1.title')?.textContent.trim() || 
                `youtube_video_${extractVideoId(window.location.href) || 'unknown'}`;
  
  // Remove any invalid characters for filenames
  return title;
}

/**
 * Check if the current page is a YouTube video page
 */
function checkIfYouTubeVideoPage() {
  const url = window.location.href;
  
  // Must be youtube.com domain
  const isYouTubeDomain = window.location.hostname === 'youtube.com' || 
                         window.location.hostname === 'www.youtube.com' ||
                         window.location.hostname === 'm.youtube.com';
  
  // Must have /watch path
  const isWatchPath = window.location.pathname === '/watch';
  
  // Must have v parameter
  const urlParams = new URLSearchParams(window.location.search);
  const hasVideoParam = urlParams.has('v');
  
  const isVideoPage = isYouTubeDomain && isWatchPath && hasVideoParam;
  console.log("SubtideX: URL check -", url, "is video page?", isVideoPage);
  
  return isVideoPage;
}

/**
 * Extract video ID from URL
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

/**
 * Extracts subtitles from a YouTube video
 * Uses multiple strategies to handle various YouTube layouts and subtitle formats
 */
async function getYouTubeSubtitles() {
  console.log("SubtideX: Starting subtitle extraction");
  
  try {
    // Strategy 1: Access subtitle data from video player
    const ytplayer = await getYouTubePlayerData();
    if (ytplayer && ytplayer.captions && ytplayer.captions.playerCaptionsTracklistRenderer) {
      console.log("SubtideX: Found subtitle data in ytplayer");
      return await extractFromPlayerData(ytplayer);
    }
    
    // Strategy 2: Look for caption track in page source
    const captionTrack = await findCaptionTrackInPage();
    if (captionTrack) {
      console.log("SubtideX: Found caption track in page source");
      return await fetchAndParseCaptionTrack(captionTrack);
    }
    
    // Strategy 3: Extract directly from video element's textTracks
    const videoTextTracks = await extractFromVideoTextTracks();
    if (videoTextTracks && videoTextTracks.length > 0) {
      console.log("SubtideX: Extracted textTracks from video element");
      return videoTextTracks;
    }
    
    // If we've reached this point, we couldn't find subtitles
    console.log("SubtideX: No subtitles found using any strategy");
    throw new Error("No subtitles found for this video");
  } catch (error) {
    console.error("SubtideX: Error extracting subtitles:", error);
    throw error;
  }
}

/**
 * Gets YouTube player data from window.ytplayer or page source
 */
async function getYouTubePlayerData() {
  return new Promise((resolve) => {
    // First check if ytplayer is directly accessible
    if (window.ytplayer && window.ytplayer.config) {
      return resolve(window.ytplayer.config);
    }
    
    // Check for ytInitialPlayerResponse
    if (window.ytInitialPlayerResponse) {
      return resolve(window.ytInitialPlayerResponse);
    }
    
    // Try to find player data in page source
    const pageSource = document.documentElement.innerHTML;
    const ytInitialDataMatch = pageSource.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
    
    if (ytInitialDataMatch && ytInitialDataMatch[1]) {
      try {
        const ytData = JSON.parse(ytInitialDataMatch[1]);
        return resolve(ytData);
      } catch (e) {
        console.error("SubtideX: Failed to parse ytInitialPlayerResponse", e);
      }
    }
    
    // If we can't find it, resolve with null
    resolve(null);
  });
}

/**
 * Extract subtitles from player data
 */
async function extractFromPlayerData(playerData) {
  try {
    // Navigate through the response structure to find captions
    const captions = playerData.captions?.playerCaptionsTracklistRenderer?.captionTracks || 
                    playerData.captionTracks || 
                    [];
    
    if (!captions || captions.length === 0) {
      throw new Error("No caption tracks found in player data");
    }
    
    // Get the first caption track URL (usually the default language)
    const captionTrack = captions[0];
    const captionUrl = captionTrack.baseUrl || captionTrack.url;
    
    if (!captionUrl) {
      throw new Error("Caption URL not found");
    }
    
    // Fetch the caption track
    return await fetchAndParseCaptionTrack(captionUrl);
  } catch (error) {
    console.error("SubtideX: Error extracting from player data:", error);
    throw error;
  }
}

/**
 * Finds caption track URL in page source
 */
async function findCaptionTrackInPage() {
  const pageSource = document.documentElement.innerHTML;
  
  // Various patterns to match caption URLs
  const patterns = [
    /"captionTracks":\[{"baseUrl":"([^"]+)"/, // Standard format
    /captionTracks':\[{.*?'baseUrl':\s*'([^']+)'/, // Alternative format
    /timedtext\?.*?":'(https:\/\/www.youtube.com\/api\/timedtext[^']+)'/, // Timed text API
    /playerCaptionsTracklistRenderer.*?baseUrl":"([^"]+)"/ // Player captions renderer
  ];
  
  for (const pattern of patterns) {
    const match = pageSource.match(pattern);
    if (match && match[1]) {
      return match[1].replace(/\\u0026/g, '&');
    }
  }
  
  return null;
}

/**
 * Fetches and parses a caption track from a URL
 */
async function fetchAndParseCaptionTrack(captionUrl) {
  try {
    console.log("SubtideX: Fetching caption track from:", captionUrl);
    
    // Add format=json3 if not present
    if (!captionUrl.includes('format=')) {
      captionUrl += (captionUrl.includes('?') ? '&' : '?') + 'format=json3';
    }
    
    const response = await fetch(captionUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch captions: ${response.status} ${response.statusText}`);
    }
    
    // Check content type to determine how to parse
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      // Parse JSON format
      const json = await response.json();
      
      if (json.events) {
        return json.events
          .filter(event => event.segs && event.tStartMs !== undefined)
          .map(event => ({
            start: event.tStartMs / 1000,
            duration: (event.dDurationMs || 0) / 1000,
            text: event.segs?.map(seg => seg.utf8 || '').join('').trim() || ''
          }))
          .filter(subtitle => subtitle.text);
      }
    } else if (contentType && contentType.includes('text/xml')) {
      // Parse XML format
      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');
      
      const subtitles = [];
      const textElements = xml.getElementsByTagName('text');
      
      for (let i = 0; i < textElements.length; i++) {
        const element = textElements[i];
        const start = parseFloat(element.getAttribute('start') || '0');
        const duration = parseFloat(element.getAttribute('dur') || '0');
        const text = element.textContent?.trim() || '';
        
        if (text) {
          subtitles.push({ start, duration, text });
        }
      }
      
      return subtitles;
    } else {
      // Try to parse as JSON anyway (YouTube sometimes sends incorrect content-type)
      try {
        const json = await response.json();
        
        if (json.events) {
          return json.events
            .filter(event => event.segs && event.tStartMs !== undefined)
            .map(event => ({
              start: event.tStartMs / 1000,
              duration: (event.dDurationMs || 0) / 1000,
              text: event.segs?.map(seg => seg.utf8 || '').join('').trim() || ''
            }))
            .filter(subtitle => subtitle.text);
        }
      } catch (e) {
        // Last resort: Try to parse as XML
        try {
          const text = await response.text();
          const parser = new DOMParser();
          const xml = parser.parseFromString(text, 'text/xml');
          
          const subtitles = [];
          const textElements = xml.getElementsByTagName('text');
          
          for (let i = 0; i < textElements.length; i++) {
            const element = textElements[i];
            const start = parseFloat(element.getAttribute('start') || '0');
            const duration = parseFloat(element.getAttribute('dur') || '0');
            const text = element.textContent?.trim() || '';
            
            if (text) {
              subtitles.push({ start, duration, text });
            }
          }
          
          return subtitles;
        } catch (xmlError) {
          console.error("SubtideX: Failed to parse as XML:", xmlError);
          throw new Error("Failed to parse caption track");
        }
      }
    }
    
    throw new Error("No subtitles found in the caption track");
  } catch (error) {
    console.error("SubtideX: Error fetching caption track:", error);
    throw error;
  }
}

/**
 * Extract subtitles from video element's textTracks
 */
async function extractFromVideoTextTracks() {
  return new Promise((resolve) => {
    // Find the video element
    const videoElement = document.querySelector('video');
    
    if (!videoElement || !videoElement.textTracks || videoElement.textTracks.length === 0) {
      return resolve(null);
    }
    
    console.log("SubtideX: Found video element with", videoElement.textTracks.length, "text tracks");
    
    // Try to find an active track
    let activeTrack = null;
    
    for (let i = 0; i < videoElement.textTracks.length; i++) {
      const track = videoElement.textTracks[i];
      
      if (track.mode === 'showing') {
        activeTrack = track;
        break;
      }
    }
    
    // If no active track, use the first one
    if (!activeTrack && videoElement.textTracks.length > 0) {
      activeTrack = videoElement.textTracks[0];
      activeTrack.mode = 'showing'; // Activate it
    }
    
    if (!activeTrack) {
      return resolve(null);
    }
    
    // We need to wait for cues to load
    setTimeout(() => {
      if (!activeTrack.cues || activeTrack.cues.length === 0) {
        return resolve(null);
      }
      
      // Convert cues to our subtitle format
      const subtitles = [];
      
      for (let i = 0; i < activeTrack.cues.length; i++) {
        const cue = activeTrack.cues[i];
        
        subtitles.push({
          start: cue.startTime,
          duration: cue.endTime - cue.startTime,
          text: cue.text.trim()
        });
      }
      
      resolve(subtitles);
    }, 1000); // Give it a second to load cues
  });
}

/**
 * Converts subtitle objects to CSV format
 */
function convertToCSV(subtitles) {
  if (!subtitles || subtitles.length === 0) {
    throw new Error("No subtitles to convert");
  }
  
  console.log("SubtideX: Converting subtitles to CSV format");
  
  // CSV header
  let csv = "Start Time,End Time,Duration,Text\n";
  
  // Add each subtitle as a row
  subtitles.forEach(subtitle => {
    const startTime = formatTimestamp(subtitle.start);
    const endTime = formatTimestamp(subtitle.start + subtitle.duration);
    const duration = subtitle.duration.toFixed(2);
    
    // Properly escape text for CSV (double quotes, escape internal quotes)
    const escapedText = subtitle.text.replace(/"/g, '""');
    
    // Add the row to CSV
    csv += `${startTime},${endTime},${duration},"${escapedText}"\n`;
  });
  
  return csv;
}

/**
 * Formats a timestamp into HH:MM:SS.mmm format
 */
function formatTimestamp(seconds) {
  const date = new Date(seconds * 1000);
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  const secs = date.getUTCSeconds().toString().padStart(2, '0');
  const ms = date.getUTCMilliseconds().toString().padStart(3, '0');
  
  return `${hours}:${minutes}:${secs}.${ms}`;
}

/**
 * Shows a loading indicator on the page
 */
function showLoadingIndicator() {
  // Remove existing indicator if present
  hideLoadingIndicator();
  
  // Create container
  loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'subtidex-loading';
  
  // Set styles for the loading indicator
  const style = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  
  loadingIndicator.style.cssText = style;
  
  // Create content
  const content = document.createElement('div');
  content.style.cssText = `
    background-color: #1a1a1a;
    border-radius: 8px;
    padding: 30px 40px;
    text-align: center;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    max-width: 90%;
    width: 360px;
  `;
  
  // Add logo
  const logo = document.createElement('div');
  logo.innerHTML = `
    <svg width="80" height="80" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="64" cy="64" r="60" fill="#137dc5"/>
      <path d="M64 30C53.5 30 45 35 45 43C45 65 85 50 85 75C85 85 75 90 64 90C56 90 49 87 45 82" stroke="white" stroke-width="10" stroke-linecap="round"/>
      <rect x="30" y="100" width="68" height="6" rx="3" fill="white"/>
      <path d="M64 55L64 78M64 78L54 68M64 78L74 68" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  logo.style.marginBottom = '15px';
  
  // Add title and message
  const title = document.createElement('h2');
  title.textContent = 'Extracting Subtitles';
  title.style.cssText = `
    margin: 0 0 10px 0;
    font-size: 20px;
    font-weight: 600;
    color: white;
  `;
  
  const message = document.createElement('p');
  message.textContent = 'Please wait while we extract and download the subtitles...';
  message.style.cssText = `
    margin: 0 0 20px 0;
    font-size: 14px;
    color: #cccccc;
  `;
  
  // Create spinner
  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 40px;
    height: 40px;
    margin: 0 auto;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #137dc5;
    animation: spin 1s ease-in-out infinite;
  `;
  
  // Add keyframes for spinner animation
  const keyframes = document.createElement('style');
  keyframes.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(keyframes);
  
  // Assemble the loading indicator
  content.appendChild(logo);
  content.appendChild(title);
  content.appendChild(message);
  content.appendChild(spinner);
  loadingIndicator.appendChild(content);
  
  // Add dismiss on background click
  loadingIndicator.addEventListener('click', (e) => {
    if (e.target === loadingIndicator) {
      hideLoadingIndicator();
    }
  });
  
  // Add to DOM
  document.body.appendChild(loadingIndicator);
}

/**
 * Hides the loading indicator
 */
function hideLoadingIndicator() {
  const existing = document.getElementById('subtidex-loading');
  if (existing) {
    existing.remove();
  }
  loadingIndicator = null;
}

/**
 * Shows a notification message to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification: "success", "error", "info"
 */
function showNotification(message, type = "info") {
  // Remove any existing notification
  const existing = document.getElementById('subtidex-notification');
  if (existing) {
    existing.remove();
  }
  
  // Determine colors based on type
  let bgColor, textColor, borderColor, icon;
  
  switch (type) {
    case "success":
      bgColor = '#27ae60';
      textColor = 'white';
      borderColor = '#2ecc71';
      icon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      `;
      break;
    case "error":
      bgColor = '#e74c3c';
      textColor = 'white';
      borderColor = '#c0392b';
      icon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      `;
      break;
    default: // info
      bgColor = '#3498db';
      textColor = 'white';
      borderColor = '#2980b9';
      icon = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      `;
  }
  
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'subtidex-notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: ${bgColor};
    color: ${textColor};
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    max-width: 80%;
    animation: subtidex-slide-in 0.3s ease-out;
  `;
  
  // Add icon and message
  notification.innerHTML = `${icon} ${message}`;
  
  // Add animation keyframes
  const keyframes = document.createElement('style');
  keyframes.textContent = `
    @keyframes subtidex-slide-in {
      from { transform: translate(-50%, -20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes subtidex-slide-out {
      from { transform: translate(-50%, 0); opacity: 1; }
      to { transform: translate(-50%, -20px); opacity: 0; }
    }
  `;
  document.head.appendChild(keyframes);
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Store reference to the notification
  notificationElement = notification;
  
  // Auto-remove after 5 seconds (unless it's an error)
  const timeout = type === "error" ? 8000 : 5000;
  
  setTimeout(() => {
    if (notification.parentNode) {
      notification.style.animation = 'subtidex-slide-out 0.3s ease-in forwards';
      
      // Remove after animation completes
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
        if (notificationElement === notification) {
          notificationElement = null;
        }
      }, 300);
    }
  }, timeout);
}

/**
 * Adds a debug button to the page in development mode
 */
function addDebugButton() {
  if (!document.getElementById('subtidex-debug-button')) {
    const debugButton = document.createElement('button');
    debugButton.id = 'subtidex-debug-button';
    debugButton.textContent = 'SubtideX Debug';
    
    const style = document.createElement('style');
    style.textContent = `
      #subtidex-debug-button {
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: #137dc5;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        cursor: pointer;
        z-index: 9999;
        opacity: 0.8;
        transition: opacity 0.2s, transform 0.2s;
      }
      #subtidex-debug-button:hover {
        opacity: 1;
        transform: translateY(-2px);
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(debugButton);
    
    debugButton.addEventListener('click', () => {
      debugMode = true;
      console.log('SubtideX: Debug mode enabled');
      showNotification('SubtideX Debug Mode Enabled', 'info');
      
      // Log page state
      console.log('SubtideX Debug: Current URL', window.location.href);
      console.log('SubtideX Debug: Is video page?', checkIfYouTubeVideoPage());
      console.log('SubtideX Debug: Video ID', extractVideoId(window.location.href));
      console.log('SubtideX Debug: ytInitialPlayerResponse exists?', !!window.ytInitialPlayerResponse);
      
      // Try to extract captions
      if (!extractionInProgress) {
        extractAndProcessSubtitles();
      } else {
        console.log('SubtideX Debug: Extraction already in progress');
      }
    });
  }
}