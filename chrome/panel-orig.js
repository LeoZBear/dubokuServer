var e=document.getElementById("content");
var t=document.getElementById("title");
var s=document.getElementById("Server");
var site = document.getElementById("site");
var c = document.getElementById("canvas");

var loadButton = document.getElementById("loadButton");
var mergeButton = document.getElementById("mergeButton");

var lc = 0;

function log(msg) {
    if (lc > 0) {
        e.innerHTML = "";
        lc = 0;
    }

    e.insertAdjacentText("afterbegin", msg);
    lc++;
}

function convertTime(sec) {
    if (sec >= 3600) {
        var hours = Math.floor(sec / 3600);
        return hours + ":" + convertTime(sec % 3600);
    } else if (sec >= 60) {
        var minutes = Math.floor(sec / 60);
        return (minutes > 9 ? ('' + minutes) : ('0' + minutes)) + ":" + convertTime(sec % 60);
    } else {
        return (sec > 9 ? ('' + sec) : ('0' + sec));
    }
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
    r = new Request(s.value + site.value + "/merge/" + t.value,
        {method:"PUT"});

    fetch(r).then(response => c.innerHTML = "merged");
}

function showTime(time) {
    log(time);
}

loadButton.addEventListener("click", load);
mergeButton.addEventListener("click", merge);

chrome.devtools.network.onRequestFinished.addListener(
    function(a){
        a.getContent(
            function(b){
                if (site.value == 'duboku') {
                    if (a.request && a.request.url) {
                        var results = (/\/([\w\d_]+\.ts)/g).exec(a.request.url);
                        if (results) {
                            var tsName = results[1];
                            //log("got2 " + tsName);
                            r = new Request(s.value + "duboku/seg/" + t.value + "/" + tsName,
                                {method:"POST",body:b});
    
                            fetch(r);

                            document.getElementById(tsName).className = "uploaded";
                        } else if ((/\.m3u8/g).test(a.request.url)) {
                            //log("got m3u8" + a.request.url);
                            r = new Request(s.value + "duboku/index/" + t.value,
                                {method:"POST",body:b});
    
                            fetch(r).then (res => load());
                        } else {
                            //log("Not matched: " + a.request.url);
                        }
                    } else {
                        //log("missing request or url");
                    }
                }
            }
        )
    }
);