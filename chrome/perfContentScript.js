
chrome.runtime.sendMessage({message: "Hello from content script", data: "Some data"}, function(response) {
    console.log("Received response from background script:", response.message);
  });

chrome.
