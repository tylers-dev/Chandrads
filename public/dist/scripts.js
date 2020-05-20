$(function(){!function(){var a=!1,n=new WebSocket("ws://"+window.location.hostname+":4545/");n.onerror=function(e){console.log(e),alert("Can't connect. Try again later.")},n.onopen=function(e){console.log("Socket Connected");var t,n,a=localStorage.getItem("triviaKey")||void 0,o={key:a};a||("#host"===window.location.hash?null!=(t=prompt("Please enter host pin",""))&&(o.hostPin=t):null!=(n=prompt("Please enter team name",""))&&(o.teamName=n),o.hostPin||o.teamName||(o.spectating=!0)),s("identify",o),document.body.style=""},n.onmessage=function(e){(e=JSON.parse(e.data))&&e.action&&t.hasOwnProperty(e.action)&&t[e.action](e)};var t={identify:function(e){e.clientType;switch(e.key&&localStorage.setItem("triviaKey",e.key),e.clientType){case"host":a=!0,$("body").removeClass().addClass("host"),$("#reveal-round").on("click",function(){var e=!0;0<$("#scoreboard-body [data-submitted='false']").length&&(e=confirm("Are you sure you want to reveal round? There are still teams thinking.")),e&&s("hostReveal")}),$("#restart-game").on("click",function(){confirm("Are you sure you want to restart the game?")&&s("hostRestartGame")}),$("#reset-round").on("click",function(){confirm("Are you sure you want to reset round?")&&s("hostResetRound")}),$("#next-round").on("click",function(){s("hostNextRound")}),$("#prev-round").on("click",function(){s("hostPrevRound")}),$.notify.addStyle("teamAccept",{html:"<div><div class='invisible key' data-notify-text='key'></div><h5><span class='badge badge-light' data-notify-text='team'></span></h5><p>Do you accept this team?</p><div class='d-flex justify-content-between'><button class='btn btn-danger btn-sm reject'>Reject</button><button class='btn btn-primary btn-sm accept'>Accept</button></div></div>"}),$(document).on("click",".notifyjs-teamAccept-base .reject",function(){$(this).trigger("notify-hide")}),$(document).on("click",".notifyjs-teamAccept-base .accept",function(){var e=$(this).parents(".notifyjs-teamAccept-base");s("hostAcceptTeam",{teamName:e.find(".badge").text(),key:e.find(".key").text()}),$(this).trigger("notify-hide")});break;case"player":$("body").removeClass().addClass("player");break;case"spectator":$("body").removeClass().addClass("spectator")}},hostTeamAccept:function(e){e.teamName&&e.key&&$.notify({team:e.teamName,key:e.key},{style:"teamAccept",globalPosition:"bottom left",autoHide:!1})},resetKey:function(e){localStorage.removeItem("triviaKey"),window.location.reload()},renderAnswerInput:function(e){var t=e.pointMap;if($("#points-btns").empty(),$("#submit-answer").attr("disabled","disabled"),"half"===t)$("#submit-answer").removeAttr("disabled");else if("final"===t){var n=$('<input type="number" max="20" maxLength="2" id="final-pts" class="form-control mb-3" placeholder="Final Wager Points" style="text-align: center;">');$("#points-btns").append(n),n.on("input",function(){$("#submit-answer").removeAttr("disabled")})}else{var a=[];for(var o in t)a.push({value:o,class:t[o]});document.getElementById("points-btns").innerHTML=tmpl("points-tmpl",a),$("#points-btns .btn").on("click",function(){$("#submit-answer").removeAttr("disabled"),$("#points-btns .btn").removeClass("active"),$(this).addClass("active")})}},renderView:function(e){document.getElementById("round-title").innerHTML=tmpl("round-title-tmpl",e);var t=Object.assign({},e);t.teams.forEach(function(e){var t=e.cheating,n=e.disconnected;e.history.forEach(function(e){void 0!==e.answer?(e.status="",e.answerLabel=e.answer):void 0!==e.submittedAnswer?(e.statusClass="badge badge-success",e.answerLabel="Submitted"):n?(e.statusClass="badge badge-dark",e.answerLabel="Disconnected"):t?(e.statusClass="badge badge-danger",e.answerLabel="Cheating"):(e.statusClass="badge badge-info",e.answerLabel="Thinking..."),e.point=void 0!==e.point?e.point:""})}),document.getElementById("scoreboard-body").innerHTML=tmpl("scoreboard-tmpl",t);var n=Object.assign({},e);n.teams.forEach(function(e){e.history=e.history.filter(function(e){return void 0!==e.answer}).reverse()}),document.getElementById("team-cards").innerHTML=tmpl("team-card-tmpl",n),a&&($(".team-name").off("click").on("click",function(){var e=$(this).text();confirm("Are you sure you want to delete team? "+e)&&s("hostRemoveTeam",{teamName:e})}),$("#scoreboard-body .answer-cell").off("click").on("click",function(){var e=$(this).closest("[data-correct]"),t=$(this).closest("[data-team]").data("team"),n=e.data("correct");e.data("correct",!n),s("hostAwardPoints",{teamName:t,correct:!n})}),$("#scoreboard-body .point-cell").off("click").on("click",function(){s("hostMultiplyPoints",{teamName:$(this).parent().data("team")})}))},alert:function(e){e.msg&&("error"===e.msg?alert("Error: Please Refresh Page and Try Again."):alert(e.msg),e.restart&&window.location.reload())}};function s(e,t){(t=t||{}).action=e,n.send(JSON.stringify(t))}$("#submit-answer").on("click",function(){var e=$("#answer-text"),t=e.val(),n=$("#points-btns .btn.active").data("val")||"half";0<$("#final-pts").length&&(n=$("#final-pts").val()||20),t&&n&&(s("playerAnswer",{answer:t,point:n}),e.val(""),$("#points-btns .btn").removeClass("active"),$("#submit-answer").attr("disabled","disabled"))}),window.addEventListener("focus",function(){s("cheatDetection",{cheat:!1})}),window.addEventListener("blur",function(){s("cheatDetection",{cheat:!0})});var o=new NoSleep;document.addEventListener("click",function e(){document.removeEventListener("click",e,!1),o.enable()},!1)}()});