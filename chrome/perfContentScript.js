(function(){function b(){var a=new Date;return a.getFullYear()+"-"+(a.getMonth()+1)+"-"+a.getDate()+" "+a.getHours()+":"+a.getMinutes()+":"+a.getSeconds()+":"+a.getMilliseconds()}console.log("%cDocument start: ","color: blue; font-size: 15px;");console.log("%c"+b(),"color: green; font-size: 13px");window.addEventListener("polymer-ready",function(){console.log("%cpolymer-ready:","color: blue; font-size: 15px;");console.log("%c"+b(),"color: green; font-size: 13px");chrome.runtime.sendMessage({name:"polymer-ready"})})})();
