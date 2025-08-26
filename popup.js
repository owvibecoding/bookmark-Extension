// Utility: Format date
function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}

// Utility: Download a file
function downloadFile(data, filename, type = 'application/json') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Utility: Disable/enable export buttons
function setButtonsState(disabled) {
  const buttons = document.querySelectorAll('.export-button');
  buttons.forEach(button => {
    button.disabled = disabled;
  });
}

// Fetch all history items
async function fetchAllHistory() {
  const overheadMs = 1000;
  let allItems = [];
  let startTime = 0;
  let finished = false;

  while (!finished) {
    let historyBatch = await chrome.history.search({
      text: '',
      startTime: startTime,
      maxResults: 100000
    });

    if (historyBatch.length === 0) {
      finished = true;
      break;
    }

    allItems.push(...historyBatch);
    historyBatch.sort((a, b) => a.lastVisitTime - b.lastVisitTime);
    let lastVisitTime = historyBatch[historyBatch.length - 1].lastVisitTime;
    startTime = lastVisitTime + overheadMs;
  }

  return allItems;
}

// Get tab history info
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

// Collect all tabs with history for all windows
async function collectWindowsWithHistory(windows) {
  return Promise.all(
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
            lastVisitTime: historyInfo.lastVisitTime,
            lastVisitDate: historyInfo.lastVisitDate,
            visitCount: historyInfo.visitCount,
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
}

// Collect all tabs with history (flat)
async function collectAllTabsWithHistory(allTabs) {
  return Promise.all(
    allTabs.map(async (tab) => {
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
        lastVisitTime: historyInfo.lastVisitTime,
        lastVisitDate: historyInfo.lastVisitDate,
        visitCount: historyInfo.visitCount,
        openedAt: historyInfo.lastVisitDate ? formatDate(historyInfo.lastVisitTime) : 'Unknown'
      };
    })
  );
}

// Export open tabs as JSON
async function exportTabsAsJson() {
  setButtonsState(true);
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const windowsWithHistory = await collectWindowsWithHistory(windows);

    const exportData = {
      exportDate: new Date().toISOString(),
      exportTimestamp: Date.now(),
      totalWindows: windows.length,
      totalTabs: windows.reduce((total, window) => total + window.tabs.length, 0),
      note: "lastVisitTime represents the most recent visit to the URL, which is typically close to when the tab was opened",
      windows: windowsWithHistory
    };

    downloadFile(
      JSON.stringify(exportData, null, 2),
      `open-tabs-export-${new Date().toISOString().split('T')[0]}.json`
    );
    console.log('Exported tabs data:', exportData);
  } catch (error) {
    console.error('Error exporting tabs:', error);
    alert('Error exporting tabs: ' + error.message);
  } finally {
    setButtonsState(false);
  }
}

// Export all tabs as JSON (flat)
async function exportAllAsJson() {
  setButtonsState(true);
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const allTabs = windows.flatMap(window => window.tabs);
    const tabsWithHistory = await collectAllTabsWithHistory(allTabs);
    const historyItems = await fetchAllHistory();

    // Remove duplicate history by URL and count visits
    const historyMap = new Map();
    historyItems.forEach(item => {
      if (historyMap.has(item.url)) {
        const entry = historyMap.get(item.url);
        entry.count += 1;
        if (item.lastVisitTime > entry.lastVisitTime) {
          entry.lastVisitTime = item.lastVisitTime;
          entry.title = item.title;
        }
      } else {
        historyMap.set(item.url, {
          url: item.url,
          title: item.title,
          lastVisitTime: item.lastVisitTime,
          count: 1
        });
      }
    });
    const uniqueHistory = Array.from(historyMap.values());

    // Collect bookmarks (flat list)
    function flattenBookmarks(nodes, arr = []) {
      nodes.forEach(node => {
        if (node.url) {
          arr.push({
            id: node.id,
            title: node.title,
            url: node.url,
            dateAdded: node.dateAdded ? new Date(node.dateAdded).toISOString() : null,
            parentId: node.parentId || null
          });
        }
        if (node.children) {
          flattenBookmarks(node.children, arr);
        }
      });
      return arr;
    }
    const bookmarkTreeNodes = await chrome.bookmarks.getTree();
    const bookmarks = flattenBookmarks(bookmarkTreeNodes);

    // Mark tabs as open
    const openTabs = tabsWithHistory.map(tab => ({
      ...tab,
      state: "open"
    }));

    const exportData = {
      exportDate: new Date().toISOString(),
      exportTimestamp: Date.now(),
      totalWindows: windows.length,
      totalTabs: allTabs.length,
      tabs: openTabs,
      history: uniqueHistory,
      bookmarks: bookmarks
    };

    downloadFile(
      JSON.stringify(exportData, null, 2),
      `all-tabs-export-${new Date().toISOString().split('T')[0]}.json`
    );
    console.log('Exported all tabs data:', exportData);
  } catch (error) {
    console.error('Error exporting all tabs:', error);
    alert('Error exporting all tabs: ' + error.message);
  } finally {
    setButtonsState(false);
  }
}

// Update counts in popup
async function updateCounts() {
  chrome.tabs.query({}, function(tabs) {
    document.getElementById('tabsCount').textContent = tabs.length;
  });

  const historyItems = await fetchAllHistory();
  document.getElementById('historyCount').textContent = historyItems.length;

  chrome.bookmarks.getTree(function(bookmarkTreeNodes) {
    let bookmarkCount = 0;
    function countBookmarks(node) {
      if (node.url) bookmarkCount++;
      if (node.children) node.children.forEach(countBookmarks);
    }
    bookmarkTreeNodes.forEach(countBookmarks);
    document.getElementById('bookmarksCount').textContent = bookmarkCount;
  });
}


async function exportTabsAsMarkdown() {
  setButtonsState(true);
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    const allTabs = windows.flatMap(window => window.tabs);
    const tabsWithHistory = await collectAllTabsWithHistory(allTabs);

    // Mark tabs as open
    const openTabs = tabsWithHistory.map(tab => ({
      ...tab,
      state: "open"
    }));

    // Build Markdown output
    let md = `# Exported Tabs\n\n`;
    md += `- **Export Date:** ${new Date().toISOString()}\n`;
    md += `- **Total Windows:** ${windows.length}\n`;
    md += `- **Total Tabs:** ${allTabs.length}\n\n`;
    md += `## Tabs\n\n`;

    openTabs.forEach((tab, i) => {
      md += `${i + 1}. [${tab.title || "No Title"}](${tab.url})  \n`;
    });

    downloadFile(
      md,
      `tabs-export-${new Date().toISOString().split("T")[0]}.md`
    );

    console.log("Exported tabs as Markdown:\n", md);
  } catch (error) {
    console.error("Error exporting tabs:", error);
    alert("Error exporting tabs: " + error.message);
  } finally {
    setButtonsState(false);
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', function() {
  updateCounts();
  // document.getElementById('exportButton').addEventListener('click', exportAsMarkdown);
  // document.getElementById('downloadButton').addEventListener('click', exportAsMarkdown);
  // document.getElementById('exportTabsJsonButton').addEventListener('click', exportTabsAsJson);
   document.getElementById('exportAllJsonButton').addEventListener('click', exportAllAsJson);
   document.getElementById('exportTabsMDButton').addEventListener('click', exportTabsAsMarkdown);
});