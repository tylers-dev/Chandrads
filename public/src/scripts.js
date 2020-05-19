$(function() {
    (function() {
        //Global Vars
        var isHost = false;

        //Web socket connection////////////////////////////////////////////////////////////////////////
        var socket = new WebSocket("ws://" + window.location.hostname + ":4545/");
        socket.onerror = function(error) {
            console.log(error);
            alert("Can't connect. Try again later.");
        };
        socket.onopen = function(event) {
            console.log("Socket Connected");
            //Look for trivia key to identify with server
            var key = localStorage.getItem("triviaKey") || undefined;
            console.log(key)
                //If client has a key, pass the key for identification
            var params = { key: key };
            if (!key) {
                //No key means client needs to identify itself and provide information
                if (window.location.hash === "#host") {
                    //Prompt for host pin to identify as host
                    var hostPin = prompt("Please enter host pin", "");
                    if (hostPin != null) params.hostPin = hostPin;
                } else {
                    //Prompt for team name to identify as a player
                    var teamName = prompt("Please enter team name", "");
                    if (teamName != null) params.teamName = teamName;
                }
            }
            ServerSend("identify", params);
        };

        // Server Responses////////////////////////////////////////////////////////////////////////////
        socket.onmessage = function(event) {
            var event = JSON.parse(event.data);
            if (event && event.action && CAction.hasOwnProperty(event.action)) {
                CAction[event.action](event);
            }
        };

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        //Client Action - all action instructions coming from the server to the client////////////////
        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////
        var CAction = {
            identify: function(data) {
                var clientType = data.clientType;
                if (data.key) localStorage.setItem("triviaKey", data.key);
                switch (data.clientType) {
                    case "host":
                        isHost = true;
                        $("body").addClass("host");
                        document.body.style = "";
                        break;
                    case "player":
                        $("body").addClass("player");
                        document.body.style = "";
                        break;
                }
            },
            resetKey: function(data) {
                localStorage.removeItem("triviaKey");
                window.location.reload();
            },
            //Render the answer input options to the client
            renderAnswerInput: function(data) {
                var pointMap = data.pointMap;
                $("#points-btns").empty();
                $("#submit-answer").attr("disabled", "disabled");
                //Points options
                if (pointMap === "half") {
                    $("#submit-answer").removeAttr("disabled");
                } else if (pointMap === "final") {
                    var $finalPts = $('<input type="number" max="20" maxLength="2" id="final-pts" class="form-control mb-3" placeholder="Final Wager Points" style="text-align: center;">');
                    $("#points-btns").append($finalPts);
                    $finalPts.on("input", function() {
                        $("#submit-answer").removeAttr("disabled");
                    })
                } else {
                    var points = [];
                    for (var pt in pointMap) {
                        points.push({
                            value: pt,
                            class: pointMap[pt]
                        })
                    }
                    document.getElementById('points-btns').innerHTML = tmpl('points-tmpl', points)
                    $("#points-btns .btn").on("click", function() {
                        $("#submit-answer").removeAttr("disabled");
                        $("#points-btns .btn").removeClass("active");
                        $(this).addClass("active");
                    })
                }
            },
            renderView: function(data) {
                //Round title
                document.getElementById('round-title').innerHTML = tmpl('round-title-tmpl', data)

                //Scoreboard
                var scoreboardData = Object.assign({}, data);
                scoreboardData.teams.forEach(function(team) {
                    var isCheating = team.cheating;
                    var isDisconnected = team.disconnected;
                    team.history.forEach(function(x) {
                        if (x.answer !== undefined) {
                            x.status = "";
                            x.answerLabel = x.answer;
                        } else if (x.submittedAnswer !== undefined) {
                            x.statusClass = "badge badge-success";
                            x.answerLabel = "Submitted";
                        } else if (isDisconnected) {
                            x.statusClass = "badge badge-dark";
                            x.answerLabel = "Disconnected";
                        } else if (isCheating) {
                            x.statusClass = "badge badge-danger";
                            x.answerLabel = "Cheating";
                        } else {
                            x.statusClass = "badge badge-info";
                            x.answerLabel = "Thinking...";
                        }
                        x.point = x.point !== undefined ? x.point : "";
                    });
                })
                document.getElementById('scoreboard-body').innerHTML = tmpl('scoreboard-tmpl', scoreboardData)

                //Team Card
                var teamCardData = Object.assign({}, data);
                teamCardData.teams.forEach(function(team) {
                    team.history = team.history.filter(function(x) {
                        return x.answer !== undefined;
                    }).reverse();
                })
                document.getElementById('team-cards').innerHTML = tmpl('team-card-tmpl', teamCardData)

                //Alter UI for host
                if (isHost) {
                    //Remove teams
                    $(".team-name").off("click").on("click", function() {
                        var teamName = $(this).text();
                        var deleteTeam = confirm("Are you sure you want to delete team? " + teamName);
                        if (deleteTeam) {
                            ServerSend("hostRemoveTeam", { teamName: teamName });
                        }
                    });
                    //Award points
                    $("#scoreboard-body .answer-cell").off("click").on("click", function() {
                        var $that = $(this).closest("[data-correct]");
                        var teamName = $(this).closest("[data-team]").data("team");
                        var correct = $that.data("correct");
                        $that.data("correct", !correct);
                        ServerSend("hostAwardPoints", { teamName: teamName, correct: !correct });
                    });
                    //Allow multiplied points
                    $("#scoreboard-body .point-cell").off("click").on("click", function() {
                        var teamName = $(this).parent().data("team");
                        ServerSend("hostMultiplyPoints", { teamName: teamName });
                    })
                }
            },
            alert: function(data) {
                if (data.msg) {
                    if (data.msg === "error") {
                        alert("Error: Please Refresh Page and Try Again.");
                    } else {
                        alert(data.msg);
                    }
                }
            }
        }

        function ServerSend(action, data) {
            data = data || {};
            data.action = action;
            socket.send(JSON.stringify(data));
        }

        $("#submit-answer").on("click", function() {
            var $answerText = $("#answer-text");
            var answerVal = $answerText.val();
            var pointVal = $("#points-btns .btn.active").data("val") || "half";
            if ($("#final-pts").length > 0) pointVal = $("#final-pts").val() || 20;
            if (answerVal && pointVal) {
                ServerSend("playerAnswer", { answer: answerVal, point: pointVal });
                $answerText.val("");
                $("#points-btns .btn").removeClass("active");
                $("#submit-answer").attr("disabled", "disabled");
            }
        })

        //Host controls
        $("#reveal-round").on("click", function() {
            var teamsStillThinking = $("#scoreboard-body [data-submitted='false']").length > 0;
            var revealReady = true;
            if (teamsStillThinking) {
                revealReady = confirm("Are you sure you want to reveal round? There are still teams thinking.");
            }
            if (revealReady) {
                ServerSend("hostReveal");
            }
        })
        $("#reset-round").on("click", function() {
            var resetRound = confirm("Are you sure you want to reset round?");
            if (resetRound) {
                ServerSend("hostResetRound");
            }
        })
        $("#next-round").on("click", function() {
            ServerSend("hostNextRound");
        })
        $("#prev-round").on("click", function() {
            ServerSend("hostPrevRound");
        })

        //Cheat detection
        $(window).on("focus", function() {
            ServerSend("cheatDetection", { cheat: false });
        })
        $(window).on("blur", function() {
            ServerSend("cheatDetection", { cheat: true });
        })

        //No Sleep
        var noSleep = new NoSleep();
        document.addEventListener('click', function enableNoSleep() {
            document.removeEventListener('click', enableNoSleep, false);
            noSleep.enable();
        }, false);
    })()
})