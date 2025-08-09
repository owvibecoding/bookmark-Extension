// Function to format date
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// Function to fetch all history items
async function fetchAllHistory() {
  const overheadMs = 1000; // 1 second overhead
  let allItems = [];
  let startTime = 0;
  let finished = false;

  while (!finished) {
    let historyBatch = await chrome.history.search({
      text: '',
      startTime: startTime,
      maxResults: 10000
    });

    if (historyBatch.length === 0) {
      finished = true;
      break;
    }

    allItems.push(...historyBatch);

    // Sort by lastVisitTime just in case
    historyBatch.sort((a, b) => a.lastVisitTime - b.lastVisitTime);

    // Get last item's time
    let lastVisitTime = historyBatch[historyBatch.length - 1].lastVisitTime;

    // Move startTime forward slightly (to avoid infinite loops)
    startTime = lastVisitTime + overheadMs;
  }

  return allItems;
}

// Function to display open tabs
function displayTabs() {
  const tabsList = document.getElementById('tabsList');
  
  chrome.tabs.query({}, function(tabs) {
    tabs.forEach(function(tab) {
      const div = document.createElement('div');
      div.className = 'item';
      
      // Create favicon image
      const favicon = document.createElement('img');
      favicon.className = 'favicon';
      favicon.src = tab.favIconUrl || 'icons/icon16.png';
      
      // Create link
      const link = document.createElement('a');
      link.href = tab.url;
      link.textContent = tab.title;
      link.target = '_blank';
      
      div.appendChild(favicon);
      div.appendChild(link);
      tabsList.appendChild(div);
    });
  });
}

// Function to display history items
function displayHistory() {
  const historyList = document.getElementById('historyList');
  
  chrome.history.search({
    text: '',
    startTime: 0
  }, function(historyItems) {
    historyItems.forEach(function(item) {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <a href="${item.url}" target="_blank">${item.title || item.url}</a>
        <br>
        <small>${formatDate(item.lastVisitTime)}</small>
      `;
      historyList.appendChild(div);
    });
  });
}

// Function to display bookmarks
function displayBookmarks() {
  const bookmarksList = document.getElementById('bookmarksList');
  
  chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
    function processBookmarkNode(node) {
      if (node.url) {
        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `
          <a href="${node.url}" target="_blank">${node.title}</a>
        `;
        bookmarksList.appendChild(div);
      }
      if (node.children) {
        node.children.forEach(processBookmarkNode);
      }
    }
    
    bookmarkTreeNodes.forEach(processBookmarkNode);
  });
}

// Function to update counts
async function updateCounts() {
  // Count open tabs
  chrome.tabs.query({}, function(tabs) {
    document.getElementById('tabsCount').textContent = tabs.length;
  });

  // Count history items using the new function
  const historyItems = await fetchAllHistory();
  document.getElementById('historyCount').textContent = historyItems.length;

  // Count bookmarks
  chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
    let bookmarkCount = 0;
    function countBookmarks(node) {
      if (node.url) {
        bookmarkCount++;
      }
      if (node.children) {
        node.children.forEach(countBookmarks);
      }
    }
    bookmarkTreeNodes.forEach(countBookmarks);
    document.getElementById('bookmarksCount').textContent = bookmarkCount;
  });
}

// Function to disable buttons during export
function setButtonsState(disabled) {
  const buttons = document.querySelectorAll('.export-button');
  buttons.forEach(button => {
    button.disabled = disabled;
  });
}

// Function to export data as markdown
async function exportAsMarkdown() {
  setButtonsState(true);
  let markdown = '# Browser Data Export\n\n';
  let exportDate = new Date().toLocaleString();
  markdown += `Generated on: ${exportDate}\n\n`;
  
  // Export open tabs
  markdown += '## Open Tabs\n\n';
  const tabs = await chrome.tabs.query({});
  tabs.forEach(function(tab) {
    markdown += `- ${tab.title} (${tab.url})\n`;
  });

  // Export downloads if available
  try {
    if (chrome.downloads) {
      markdown += '\n## Downloads\n\n';
      const downloads = await chrome.downloads.search({});
      downloads.forEach(function(item) {
        const filename = item.filename.split('\\').pop().split('/').pop();
        const date = formatDate(item.startTime);
        markdown += `- [${filename}](${item.url}) - Downloaded on ${date}\n`;
      });
    }
  } catch (error) {
    console.log('Downloads section skipped:', error);
  }
  
  // Export history using the new function
  markdown += '\n## History\n\n';
  const historyItems = await fetchAllHistory();
  historyItems.forEach(function(item) {
    markdown += `- [${item.title || item.url}](${item.url}) - ${formatDate(item.lastVisitTime)}\n`;
  });
  
  // Export bookmarks
  markdown += '\n## Bookmarks\n\n';
  const bookmarkTreeNodes = await chrome.bookmarks.getTree();
  function processBookmarkNode(node) {
    if (node.url) {
      markdown += `- [${node.title}](${node.url})\n`;
    }
    if (node.children) {
      node.children.forEach(processBookmarkNode);
    }
  }
  bookmarkTreeNodes.forEach(processBookmarkNode);
  
  // Create and trigger download
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `browser-data-export-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
  setButtonsState(false);
}

// Function to export all open tabs from all windows as JSON
async function exportTabsAsJson() {
  setButtonsState(true);
  
  try {
    // Get all windows with their tabs
    const windows = await chrome.windows.getAll({ populate: true });
    
    // Function to get the last visit time for a URL
    async function getTabOpenTime(url) {
      try {
        const historyItems = await chrome.history.search({
          text: url,
          maxResults: 1
        });
        
        if (historyItems.length > 0) {
          return {
            lastVisitTime: historyItems[0].lastVisitTime,
            lastVisitDate: new Date(historyItems[0].lastVisitTime).toISOString(),
            visitCount: historyItems[0].visitCount
          };
        }
        return {
          lastVisitTime: null,
          lastVisitDate: null,
          visitCount: 0
        };
      } catch (error) {
        console.warn(`Could not get history for ${url}:`, error);
        return {
          lastVisitTime: null,
          lastVisitDate: null,
          visitCount: 0
        };
      }
    }
    
    // Collect all tabs with their history information
    const windowsWithHistory = await Promise.all(
      windows.map(async (window) => {
        const tabsWithHistory = await Promise.all(
          window.tabs.map(async (tab) => {
            const historyInfo = await getTabOpenTime(tab.url);
            return {
              id: tab.id,
              index: tab.index,
              windowId: tab.windowId,
              url: tab.url,
              title: tab.title,
              favIconUrl: tab.favIconUrl,
              active: tab.active,
              pinned: tab.pinned,
              highlighted: tab.highlighted,
              incognito: tab.incognito,
              audible: tab.audible,
              discarded: tab.discarded,
              autoDiscardable: tab.autoDiscardable,
              mutedInfo: tab.mutedInfo,
              status: tab.status,
              // Add timing information
              lastVisitTime: historyInfo.lastVisitTime,
              lastVisitDate: historyInfo.lastVisitDate,
              visitCount: historyInfo.visitCount,
              // Add human-readable format
              openedAt: historyInfo.lastVisitDate ? formatDate(historyInfo.lastVisitTime) : 'Unknown'
            };
          })
        );
        
        return {
          windowId: window.id,
          windowType: window.type,
          incognito: window.incognito,
          focused: window.focused,
          state: window.state,
          tabCount: window.tabs.length,
          tabs: tabsWithHistory
        };
      })
    );
    
    // Structure the data for export
    const exportData = {
      exportDate: new Date().toISOString(),
      exportTimestamp: Date.now(),
      totalWindows: windows.length,
      totalTabs: windows.reduce((total, window) => total + window.tabs.length, 0),
      note: "lastVisitTime represents the most recent visit to the URL, which is typically close to when the tab was opened",
      windows: windowsWithHistory
    };
    
    // Create and trigger download
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `open-tabs-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('Exported tabs data:', exportData);
  } catch (error) {
    console.error('Error exporting tabs:', error);
    alert('Error exporting tabs: ' + error.message);
  } finally {
    setButtonsState(false);
  }
}

// Initialize the popup
document.addEventListener('DOMContentLoaded', function() {
  //displayTabs();
  //displayHistory();
  //displayBookmarks();
  updateCounts();
  
  // Add event listeners for buttons
  document.getElementById('exportButton').addEventListener('click', exportAsMarkdown);
  document.getElementById('downloadButton').addEventListener('click', exportAsMarkdown);
  document.getElementById('exportTabsJsonButton').addEventListener('click', exportTabsAsJson);
}); 