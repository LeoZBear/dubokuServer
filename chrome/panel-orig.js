var e=document.getElementById("content");
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

function log(msg) {
    if (lc > 0) {
        e.innerHTML = "";
        lc = 0;
    }

    e.insertAdjacentText("afterbegin", msg + "\n");
    lc++;
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
    //log("Got Load request ");
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
        var index = tab.title.indexOf("-免费在线观看");
        if (index > -1) {
            title = title.substring(0, index);
        }

        if (title == null|| title.length == 0) {
            title = t.value
        }

        title = encodeURI(title)
        r = new Request(s.value + site.value + "/merge/" + t.value + "/" + title,
            {method:"PUT"});
        fetch(r).then(response => c.innerHTML = "merged");
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

function callMultipleTimes(fn, times, callback) {
    if (times > 0) {
      fn(() => {
        //log("Time: " + times);
        callMultipleTimes(fn, times - 1, callback);
      });
    } else {
      callback();
    }
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




chrome.devtools.network.onRequestFinished.addListener(
    function(a){

        if (a.request && a.request.url) {
            // log("got " + a.request.url);
            var results = (/\/([\w\d_-]+\.ts)/g).exec(a.request.url);
            if (results) {
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

function handleM3u8(a) {
    var iyfRe = /\/([\w\d-]+)\.mp4\//g
    iyfResult = iyfRe.exec(a.request.url)
    if (iyfResult) {
        log("Found iyf m3u8")
        id = iyfResult[1]
        title.value = id
    }

    a.getContent(
        function(b){
            r = new Request(s.value + "duboku/index/" + t.value,
                {method:"POST",body:b});

            fetch(r).then (res => load());
        }
    );    
}
