var e=document.getElementById("logPanel");
var t=document.getElementById("title");
var s=document.getElementById("Server");
var statusBoard=document.getElementById("status");
var site = document.getElementById("site");
var c = document.getElementById("canvas");

var loadButton = document.getElementById("loadButton");
var mergeButton = document.getElementById("mergeButton");
var asyncDownloadButton = document.getElementById("asyncDownloadButton");

var lc = 0;
var debugging = false

function formatDate() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0'); // months are 0-based
  const dd = String(date.getDate()).padStart(2, '0');
  const HH = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
}

function log(msg) {
    var prefix = formatDate()

    if (lc > 10000) {
        e.innerHTML = "";
        lc = 0;
    }

    e.insertAdjacentHTML("beforeend", prefix + " " + msg + "<br/>");
    lc++;
}

function debug(msg) {
    if (!debugging) {
        return;
    }

    msg = "[Debug] " + msg;
    log(msg);
}

function showStatus(msg) {
    statusBoard.innerText = msg;
}

function subConvertTime(num) {
    return num > 9
        ? num
        : "0" + num;
}

function convertTime(sec) {
    var hours = Math.floor(sec / 3600);
    var minutes = Math.floor((sec % 3600) / 60);
    var seconds = Math.floor(sec % 60);

    return subConvertTime(hours) + ":"
            + subConvertTime(minutes) + ":"
            + subConvertTime(seconds);
}

function uploadSegment(payload, tsName) {
    var r = new Request(s.value + "duboku/seg/" + t.value + "/" + tsName,
        {method:"POST",body:payload});

    fetch(r).then(response => {
        if (response.status != 200) {
            return;
        }

        var node = document.getElementById(tsName);
        node.className = "uploaded";
        
        // Add check for all segments uploaded
        if (areAllSegmentsUploaded()) {
            log("All segments appear uploaded - verifying with server");
            verifyAndMerge();
        }
    }).catch(error => {
        log("Error uploading segment " + tsName + ": " + error);
    });
};

function asyncDownloadSeg(url, tsName) {
    r = new Request(url, {method:"GET"});
    fetch(r)
        .then(res => res.arrayBuffer())
        .then(buffer => uploadSegment(arrayBufferToBase64(buffer), tsName))
        .catch(error => log("Direct fetch failed for " + tsName + " (" + url +"): " + error));               
}

function load() {
    log("Got Load request ");
    currentTabId = chrome.devtools.inspectedWindow.tabId
    
    r = new Request(s.value + site.value + "/load/" + t.value,
        {method:"GET"});

    fetch(r).then(response => response.json()).then(data => {
        console.log(data);
        if (!data.success) {
            console.log("Failed. Skipping");
            return;
        }

        c.innerHTML = "";

        for(var i = 0; i < data.segments.length; ++i) {
            var seg = data.segments[i];
            var time = convertTime(seg.startSec);
            const node = document.createElement("li");
            node.id = seg.name;
            node.className = seg.uploaded ? 'uploaded' : 'notuploaded';
            node.title = "" + time + " " + seg.name;
            node.onclick = (function (time2) {
                return function() { showTime(time2) }
            })(time);

            segmentUrls[seg.name] = seg.url;

            c.appendChild(node);
        }
    });
}

function merge() {
    log("Got merge request ");
    tabId = chrome.devtools.inspectedWindow.tabId
    chrome.tabs.get(tabId, tab => {
        tabTitle = encodeURI(tab.title);
        var index = tabTitle.indexOf('-%E5%85%8D%E8%B4%B9%E5%9C%A8%E7%BA%BF%E8%A7%82%E7%9C%8B');
        if (index > -1) {
            tabTitle = tabTitle.substring(0, index);
        }

        r = new Request(s.value + site.value + "/merge/" + t.value + "/" + tabTitle,
            {method:"PUT"});
        fetch(r).then(response => c.innerHTML = "merged:" + decodeURI(tabTitle));
    })
}

function showTime(time) {
    log(time);
}

loadButton.addEventListener("click", load);
mergeButton.addEventListener("click", merge);


function arrayBufferToBase64(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    for (var i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

var asyncDownloading = false;
asyncDownloadButton.addEventListener("click", function() {
    if (asyncDownloading) {
        asyncDownloading = false;
        asyncDownloadButton.innerText = 'AsyncDownload';
    } else {
        asyncDownloading = true;
        asyncDownloadButton.innerText = 'StopAsyncDownload';
        startAsyncDownload();
    }
  }
);

function startAsyncDownload() {
    if (!asyncDownloading) {
        return;
    }

    const maxConcurrentDownloads = 5;
    downloadingSegments = getScheduledSegments(maxConcurrentDownloads);
    gap = maxConcurrentDownloads - downloadingSegments.length;
    if (gap > 0) {
        downloadSegments(gap);
    }

    setTimeout(startAsyncDownload, 1000); // wait 1 second before next batch   
}

function downloadSegments(top) {
    segments = getUnscheduledSegments(top);
    if (segments.length == 0) {
        log("All segments downloaded asynchronously.");
        asyncDownloading = false;
        asyncDownloadButton.innerText = 'AsyncDownload';
        return;
    }

    segments.forEach(function(segmentNode) {
        if (segmentNode == null) {
            return;
        }

        segmentNode.className = "downloading";
        var tsName = segmentNode.id;
        var url = urlPref + segmentUrls[tsName];
        if (url.endsWith("undefined")) {
            log("Segment URL undefined for " + tsName + ", skipping.");
            return;
        }

        debug("Async downloading " + tsName + " from " + url);
        asyncDownloadSeg(url, tsName);
    });
}

function getScheduledSegments(top) {
    var segmentNodes = []
    const segments = c.getElementsByTagName('li');
    for (let i = 0; i < segments.length; i++) {
        if (segments[i].className == 'downloading') {
            segmentNodes.push(segments[i]);
            if (segmentNodes.length >= top) {
                break;
            }
        }
    }
    return segmentNodes;
}


function getUnscheduledSegments(top) {
    var segmentNodes = []
    const segments = c.getElementsByTagName('li');
    for (let i = 0; i < segments.length; i++) {
        if (segments[i].className == 'notuploaded') {
            segmentNodes.push(segments[i]);
            if (segmentNodes.length >= top) {
                break;
            }
        }
    }
    return segmentNodes;
}


// Add this function to check if all segments are uploaded
function areAllSegmentsUploaded() {
    const segments = c.getElementsByTagName('li');
    for (let i = 0; i < segments.length; i++) {
        if (segments[i].className !== 'uploaded') {
            return false;
        }
    }
    return segments.length > 0;
}

var segmentUrls = {};
// Add a function to verify segments from server side
function verifyAndMerge() {
    // First load latest state from server
    r = new Request(s.value + site.value + "/load/" + t.value, {method:"GET"});
    
    fetch(r).then(response => response.json()).then(data => {
        if (!data.success) {
            log("Failed to verify segments from server");
            return;
        }

        // Update local UI with latest server state
        c.innerHTML = "";
        for(var i = 0; i < data.segments.length; ++i) {
            var seg = data.segments[i];
            
            var time = convertTime(seg.startSec);
            const node = document.createElement("li");
            node.id = seg.name;
            node.className = seg.uploaded ? 'uploaded' : 'notuploaded';
            node.title = time;
            node.onclick = (function (time2) {
                return function() { showTime(time2) }
            })(time);

            c.appendChild(node);
        }

        // Check again after server refresh
        if (areAllSegmentsUploaded()) {
            log("Server verification complete - proceeding with merge");
            merge();
        } else {
            log("Server verification shows incomplete segments - merge aborted");
        }
    });
}

// Modify the network listener section where uploads complete
chrome.devtools.network.onRequestFinished.addListener(
    function(a){
        if (a.request && a.request.url) {
            if (asyncDownloading == true && urlPref != "") {
                return;
            }

            // log("got " + a.request.url);
            var results = (/\/([\w\d_-]+\.ts)/g).exec(a.request.url);
            if (results) {
                if (currentTabId == -1) {
                    log("Current tab id is not inited.");
                    return;
                }

                if (urlPref == "") {
                    urlPref = a.request.url.substring(0, a.request.url.indexOf(results[1]));
                    log("Set urlPref to " + urlPref);
                }

                var tsName = results[1];
                // log("got2 " + tsName);
                a.getContent(
                    function(b){
                        if (!b) {
                            log("Segment content evicted; fetching directly: " + tsName);
                            asyncDownloadSeg(a.request.url, tsName);
                            return;
                        }

                        uploadSegment(b, tsName);
                        b = "";
                    }
                )
            } else if ((/\.m3u8/g).test(a.request.url)) {
                log("got m3u8: " + a.request.url);
                handleM3u8(a);                
            } else {
                //log("Not matched: " + a.request.url);
            }
        } else {
            //log("missing request or url");
        }

        
    }
);


var currentTabId = -1
var urlPref = ""
function handleM3u8(a) {
    // try a different type when mp4 is not encoded:
    // https://exchange-d71s111.pipecdn.vip/ppotb62-S71lT2yliZApDBSvkYzBsrmD3fpCJ4nBsHhTcyo5x8qE1QslJerjp8yMHZU2qtCZ1mBJ0mGKD4GKKtHIvjS34/chunklist.m3u8

    var iyfRes = [
        /\/([\w\d-\(\)]+)\.mp4\//g,
        /\/([\w\d-]+)\/chunklist.m3u8\?/g]
    for(var idx in iyfRes) {
        re = iyfRes[idx]
        debug("Checking " + re)
        iyfResult = re.exec(a.request.url)
        if (iyfResult) {
            debug("Found iyf m3u8")
            id = iyfResult[1]
            t.value = id

            currentTabId = chrome.devtools.inspectedWindow.tabId
            break
        } else {
            debug("Not this iyf m3u8")
        }
    }

    if (t.value == "") {
        log("No iyf m3u8 found: " + a.request.url)
        return
    }

    a.getContent(
        function(b){
            r = new Request(s.value + "duboku/index/" + t.value,
                {method:"POST",body:b});

            fetch(r).then (res => {
                if (res.status != 200) {
                    log("Failed to send m3u8 to server: " + res.status);
                    return;
                }

                load();
            }).catch(error => {
                log("Error sending m3u8 to server: " + error);
            });
        }
    );    
}

chrome.tabs.onUpdated.addListener(
    (tabId, changeInfo, tab) => {
        if (tabId != currentTabId) {
            return;
        }

        if (changeInfo && changeInfo.url) {
            currentTabId = -1
            segmentUrls = {}
            debug("Tab url has changed")
        }
    }
  )
