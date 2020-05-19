const WebSocket = require('ws');
const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require("body-parser");
const cookie = require('cookie');
const fs = require('fs');

//Security Pins - limited number of security pins for each created team
const HostPin = "4381";
const HostKey = "b4b9ce18-3f96-4962-ad76-0b2790c0cce0";
const maxTeams = 6;
const maxRounds = 6;
const maxQuestionsPerRound = 3;
const totalQuestions = (maxRounds * maxQuestionsPerRound) + 2;
const enableHalf = true;
const enableFinal = true;
const cheatingDetectionOn = true;
const points1 = [2, 4, 6];
const points2 = [5, 7, 9];
const cheatingList = {};
const rounds = (function() {
    var arr = [];
    //1st half
    for (var i = 1; i <= maxRounds / 2; i++) {
        for (var j = 1; j <= maxQuestionsPerRound; j++) {
            arr.push({
                count: i,
                title: `Round ${i} - Question ${j}`
            })
        }
    }
    //Half
    arr.push({
        count: null,
        title: "Halftime Round"
    });
    //2nd half
    for (var i = (maxRounds / 2) + 1; i <= maxRounds; i++) {
        for (var j = 1; j <= maxQuestionsPerRound; j++) {
            arr.push({
                count: i,
                title: `Round ${i} - Question ${j}`
            })
        }
    }
    //Final
    arr.push({
        count: null,
        title: "Final Round"
    })
    return arr;
})()

//Trivia game data
var Trivia = {
    questionIndex: 0,
    roundTitle: rounds[0].title,
    roundPoints: points1,
    teams: []
};
//Pull backup saved data
var backupData = null;
try {
    backupData = fs.readFileSync('data.txt', 'utf8');
} catch (err) {}
if (backupData) {
    backupData = JSON.parse(backupData);
    Trivia = backupData.Trivia;
}

//Team default data
const defaultTeamData = {
    name: "",
    score: 0,
    cheating: false,
    disconnected: false,
    history: (function() {
        var arr = [];
        for (var i = 0; i < rounds.length; i++) {
            var shortTitle = rounds[i].title;
            var round = null;
            if (shortTitle.toLowerCase().indexOf("half") !== -1) {
                shortTitle = "Half";
            } else if (shortTitle.toLowerCase().indexOf("final") !== -1) {
                shortTitle = "Final";
            } else {
                round = rounds[i].count;
                shortTitle = shortTitle.replace("Round", "").replace("Question", "").replace(/\s/g, '');
            }
            arr.push({
                round: round,
                title: shortTitle
            });
        }
        return arr;
    })()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Websocket server//////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
//app.use(express.static('chanrads-app/build'));
app.use(express.static('public'));
app.use(cookieParser());

//Start webserver
app.listen(3000);

const wss = new WebSocket.Server({ port: 4545 });
wss.on('connection', function connection(ws, req) {
    //console.log(req.connection.remoteAddress)
    //var cookies = cookie.parse(req.headers.cookie || "");
    ws.socketKey = req.headers['sec-websocket-key'];

    //Client connected
    //ws.on('open', function(event) {});

    //Client disconnected
    ws.on('close', function() {
        if (ws.team) {
            ws.team.disconnected = true;
            renderView();
        }
    });

    //Client socket responses
    ws.on('message', function incoming(msg) {
        var data = JSON.parse(msg);
        data.ws = ws;
        data.team = ws.team;
        if (data && data.action && SAction.hasOwnProperty(data.action)) {
            var isHostAction = data.action.substring(0, 4) === "host";
            if (isHostAction && !ws.host) return false;
            SAction[data.action](data);
        }
    });
});

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Server Action - all action instructions coming from the client to the server/////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const SAction = {
    //Identify - used on every new websocket connection to identify client as host or player/////////////////
    identify: function(data) {
        var ws = data.ws;
        var team = getTeamByKey(data.key);
        var isHost = data.key === HostKey;
        if (!data.key || (!team && !isHost)) {
            //Client is new, create a team for them or set as host
            if (data.hostPin !== undefined) {
                if (data.hostPin === HostPin) {
                    ws.host = true;
                    ClientSend(ws, "identify", { clientType: "host", key: HostKey });
                    ClientSend(ws, "alert", { msg: "Host Pin Accepted" });
                } else {
                    ClientSend(ws, "alert", { msg: "Error: Host Pin Not Accepted" });
                }
            } else if (data.teamName) {
                var team = JSON.parse(JSON.stringify(defaultTeamData));
                team.key = ws.socketKey;
                team.name = data.teamName;
                team.disconnected = false;
                team.cheating = false;
                Trivia.teams.push(team);
                ws.team = team;
                ClientSend(ws, "identify", { clientType: "player", key: team.key });
            } else {
                //Client has key but it doesn't match anything
                ClientSend(ws, "resetKey", {});
            }
        } else if (team) {
            //Player found
            team.disconnected = false;
            team.cheating = false;
            ws.team = team;
            ClientSend(ws, "identify", { clientType: "player" });
        } else if (isHost) {
            //Host found
            ws.host = true;
            ClientSend(ws, "identify", { clientType: "host" });
        }
        renderView();
        sendPointsInput(ws);
    },
    //Player's Answer Submission////////////////////////////////////////////////////////////////////////////////////////
    playerAnswer: function(data) {
        var team = data.team;
        var answer = data.answer;
        var point = Math.abs(data.point);
        var history = team.history[parseInt(Trivia.questionIndex)];
        //Answer validation
        if (history.submittedAnswer === undefined) {
            //Point validation
            if (Trivia.isHalfTime) {
                point = 3;
                pointsValid();
            } else if (Trivia.isFinal) {
                point = Math.min(point, 20);
                history.wager = point;
                pointsValid();
            } else {
                var pointMap = getAvailablePoints(team);
                if (pointMap) {
                    if (pointMap[point] === "enabled") {
                        pointsValid();
                    } else {
                        //Error for using point that isn't avaliable
                        ClientSend(data.ws, "alert", { msg: "Error: Point selected not available for use." });
                    }
                }
            }

            function pointsValid() {
                history.submittedAnswer = answer;
                history.submittedPoint = point;
                //Render
                renderView();
                sendPointsInput(data.ws);
            }
        } else {
            //Error, answer already submitted
            ClientSend(data.ws, "alert", { msg: "Error: Answer already submitted for this question. Please wait for the next round." });
        }
    },
    //Host Reveal - reveals all the hidden submitted answers
    hostReveal: function(data) {
        Trivia.teams.forEach(function(team) {
            var round = team.history[Trivia.questionIndex];
            if (round.answer === undefined) round.answer = round.submittedAnswer;
            if (round.point === undefined) round.point = round.submittedPoint;
            if (round.correct === undefined) round.correct = false;
        })
        renderView();
    },
    //Host Reset Round - resets all submitted data for that round
    hostResetRound: function(data) {
        Trivia.teams.forEach(function(team) {
            var round = team.history[Trivia.questionIndex];
            delete(round.submittedAnswer);
            delete(round.answer);
            delete(round.submittedPoint);
            delete(round.point);
            delete(round.correct);
            delete(round.wager);
        })
        renderView();
        sendPointsInput("all");
    },
    //Host Next Round - progress to the next round
    hostNextRound: function(data) {
        roundProgress("+1");
    },
    //Host Next Round - go back to previous round
    hostPrevRound: function(data) {
        roundProgress("-1");
    },
    //Host Award Points - host gives points to correctly answered teams
    hostAwardPoints: function(data) {
        var team = getTeam(data.teamName);
        var history = team.history[parseInt(Trivia.questionIndex)];
        history.correct = data.correct;
        renderView();
    },
    //Host Multiply Points - host has option to multiply points (used during the half time round)
    hostMultiplyPoints: function(data) {
        if (Trivia.isHalfTime) {
            var team = getTeam(data.teamName);
            var history = team.history[parseInt(Trivia.questionIndex)];
            if (history.point) {
                history.point += history.submittedPoint;
                if (history.point > history.submittedPoint * 4) {
                    history.point = history.submittedPoint;
                }
                renderView();
            }
        }
    },
    //Remove team////////////////////////////////////////////////////////////////////////////////////////
    hostRemoveTeam: function(data) {
        Trivia.teams = Trivia.teams.filter(x => x.name !== data.teamName);
        var client = getClientByName(data.teamName);
        if (client) {
            client.team = undefined;
            ClientSend(client, "resetKey", {});
        }
        renderView();
    },
    //Cheat Detection - client browsers will update when player has lost focus of screen, loss of focus can be assumed they are looking up the answer
    cheatDetection: function(data) {
        if (data.cheat !== undefined && cheatingDetectionOn && data.team) {
            if (data.cheat) {
                //Give 5 secs for team to come back to window focus
                cheatingList[data.team.name] = setTimeout(function() {
                    try {
                        if (data.team.history[Trivia.questionIndex].submittedAnswer === undefined) {
                            data.team.cheating = true;
                        }
                        renderView();
                    } catch (e) {}
                }, 5000);
            } else {
                clearTimeout(cheatingList[data.team.name])
                delete cheatingList[data.team.name];
                data.team.cheating = false;
                renderView();
            }
        }
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//Server Utility Functions
////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//Client send function for server to talk to client
function ClientSend(ws, action, data) {
    data.action = action;
    ws.send(JSON.stringify(data));
}

//Render view with new data
function renderView() {
    //Add up total score
    addScore();
    wss.clients.forEach(function each(ws) {
        //Strip private data not intended to be shown to all players
        var renderData = JSON.parse(JSON.stringify(Trivia))
        renderData.teams.forEach(x => delete x.key);
        //Send all view data
        ClientSend(ws, "renderView", renderData);
    });
    //Persist game data to file if server crashes
    fs.writeFile('./data.txt', JSON.stringify({ Trivia: Trivia }), (err) => {
        if (err) throw err;
    });
}

//Add total score for each team
function addScore() {
    Trivia.teams.forEach(function(team) {
        team.score = 0;
        var totalScore = team.history.filter(function(x) {
            return x.correct || x.wager !== undefined;
        }).map(function(x) {
            //Points are always positive, but wagers are negative if not correct
            if (x.wager && x.point !== undefined) {
                x.point = x.correct ? x.wager : -x.wager;
            }
            return x.point || 0;
        })
        if (totalScore.length > 0) {
            team.score = totalScore.reduce(function(total, num) {
                return total + num;
            });
        }
    })
}

//Get points left for team of that round
function getAvailablePoints(team) {
    var pointMap = {};
    Trivia.roundPoints.forEach(pt => pointMap[pt] = "enabled");
    //Find indexies within the round of the current question index
    if (Trivia.isHalfTime || Trivia.isFinal) {
        //Half or Final round
        return false;
    }
    var currentRound = team.history[Trivia.questionIndex].round;
    if (!currentRound) return false;
    team.history.filter(function(x) {
        return x.round === currentRound;
    }).forEach(function(y) {
        var pt = y.submittedPoint || null;
        if (pt && pointMap.hasOwnProperty(pt)) {
            pointMap[pt] = "disabled";
        }
    })
    return pointMap;
}

//Send available points to answer input
function sendPointsInput(ws) {
    if (ws === "all") {
        Array.from(wss.clients).forEach(client => sendPoints(client));
    } else {
        sendPoints(ws);
    }

    function sendPoints(ws) {
        if (ws.team) {
            var pointMap = getAvailablePoints(ws.team) || {};
            //Halftime
            if (Trivia.isHalfTime) {
                pointMap = "half";
            } else if (Trivia.isFinal) {
                pointMap = "final";
            }
            ClientSend(ws, "renderAnswerInput", { pointMap: pointMap });
        }
    }
}

//Round Progress
function roundProgress(p) {
    if (typeof p === "string") {
        if (p === "+1") {
            p = Math.min(Number(Trivia.questionIndex) + 1, totalQuestions - 1)
        } else if (p === "-1") {
            p = Math.max(Number(Trivia.questionIndex) - 1, 0)
        }
    }
    if (Trivia.questionIndex !== p) {
        if (typeof p === "number") {
            Trivia.questionIndex = p;
            Trivia.roundTitle = rounds[p].title;
            //Update points for before or after halftime
            if (p < totalQuestions / 2) {
                Trivia.roundPoints = points1;
            } else {
                Trivia.roundPoints = points2;
            }
        }
        Trivia.isHalfTime = Trivia.questionIndex === (totalQuestions / 2) - 1;
        Trivia.isFinal = Trivia.questionIndex === totalQuestions - 1;
        renderView();
        sendPointsInput("all");
    }
}

//Get team
function getTeam(teamName) {
    return Trivia.teams.find(x => x.name === teamName);
}
//Get team by key
function getTeamByKey(key) {
    return Trivia.teams.find(x => x.key === key);
}
//Get client
function getClientByName(teamName) {
    return Array.from(wss.clients).find(x => (x.team || {}).name === teamName);
}