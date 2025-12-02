var e=document.getElementById("logPanel");
var t=document.getElementById("title");
var s=document.getElementById("Server");
var statusBoard=document.getElementById("status");
var site = document.getElementById("site");
var c = document.getElementById("canvas");
var startFreq = document.getElementById("StartFreq");

var loadButton = document.getElementById("loadButton");
var mergeButton = document.getElementById("mergeButton");
var startRightButton = document.getElementById("startRightButton");

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
            node.title = time;
            node.onclick = (function (time2) {
                return function() { showTime(time2) }
            })(time);

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
        fetch(r).then(response => c.innerHTML = "merged:" + decodeURI(tabTitle) + " i.e. " + tabTitle);
    })
}

var nextLoadingTime = "00:00:00"
function showTime(time) {
    log(time);
}

loadButton.addEventListener("click", load);
mergeButton.addEventListener("click", merge);

function parseTime(time) {
    var parts = time.split(":");

    var hours = 0;
    var minutes = 0;
    var seconds = 0;
    if (parts.length == 3) {
        hours = parseInt(parts[0]);
        minutes = parseInt(parts[1]);
        seconds = parseInt(parts[2]);
    } else {
        minutes = parseInt(parts[0]);
        seconds = parseInt(parts[1]);
    }

    return hours * 3600 + minutes * 60 + seconds;
}

function getTimeDifference(currentDisplayTime) {
    var nextTime = parseTime(nextLoadingTime);
    var curTime = parseTime(currentDisplayTime);
    return nextTime - curTime;
}

function getCurrentDisplayTime(callback) {
    chrome.devtools.inspectedWindow.eval(
        'document.querySelector("vg-time-display span").innerText',
        callback
    );
}

function clickRight(callback, times) {
    //log("/clickRight " + times + "/ ");
    times = 1;
    chrome.devtools.inspectedWindow.eval(
        'var e = document.getElementsByClassName("overlay-play-container")[0]; for(var i = 0; i < ' + times + '; ++i) { e.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", code: "ArrowRight", keyCode:39, which:39, bubbles:true}));}',
        callback
    );
}

function moveCloser() {
    getCurrentDisplayTime(function(currentDisplayTime, isException) {
        if (isException) {
            log("Fetching Display time: "+ isException);
        } else {
            log("DisplayTime :" + currentDisplayTime)
            var seconds = getTimeDifference(currentDisplayTime);
            //log("Time difference: "+ seconds);
            if (seconds > 0) {
                var times = Math.floor(seconds / 5);

                clickRight(function(result, isException) {
                    if (isException) {
                        log("Error: "+ isException);
                    } else {
                        //log("clicked success");
                    }
                }, times)
            }

        }
    })

}

var scheduledNext = null;
startRightButton.addEventListener("click", function() {
    if (scheduledNext) {
        clearTimeout(scheduledNext);
        scheduledNext = null;
        startRightButton.innerText = ' StartRight ';
    } else {
        startRightButton.innerText = ' StopRight ';
        moveCloser();
        scheduledNext = setInterval(moveCloser, parseInt(startFreq.value));
    }
  }
);

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
            // log("got " + a.request.url);
            var results = (/\/([\w\d_-]+\.ts)/g).exec(a.request.url);
            if (results) {
                if (currentTabId == -1) {
                    log("Current tab id is not inited.");
                    return;
                }

                var tsName = results[1];
                // log("got2 " + tsName);
                a.getContent(
                    function(b){
                        var r = new Request(s.value + "duboku/seg/" + t.value + "/" + tsName,
                            {method:"POST",body:b});
        
                        fetch(r).then(response => {
                            if (response.status != 200) {
                                return;
                            }

                            var c = document.getElementById(tsName);
                            c.className = "uploaded";
                            var next = c.nextSibling;
                            if (next) {
                                showStatus(next.title);
                                nextLoadingTime = next.title;
                            } else {
                                showStatus("Sibling not found");
                            }
                            
                            // Add check for all segments uploaded
                            if (areAllSegmentsUploaded()) {
                                log("All segments appear uploaded - verifying with server");
                                verifyAndMerge();
                            }
                        }).catch(error => {
                            log("Error uploading segment " + tsName + ": " + error);
                        });

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
            debug("Tab url has changed")
        }
    }
  )