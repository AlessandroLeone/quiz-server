const express = require('express');
const bodyParser = require('body-parser');
const { v1: uuidv1, v4: uuidv4 } = require('uuid');
const winston = require('winston');
const stickers = require('./stickers.json');
const ProfileService = require("./profile_service.js");

const generateBotPlayer = require('./botPlayerGenerator');
const botAnswer = require('./botAnswer');

const generateQuestions = require('./GenerateQuestions');
const { orderByKey } = require('firebase/database');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));

app.use(express.static(__dirname));

const server_name = Math.random().toString(36).substring(7);

const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "http://127.0.0.1:5173",
        methods: ["GET", "POST"]
    },
    name: server_name
});


const { createLogger, format, transports } = winston;
const { combine, timestamp, label, printf } = format;

const logger = createLogger({
    format: combine(
        timestamp(),
        printf(info => {
            return `${info.timestamp} [${info.type}:line:${info.line}] ${info.emit} ${info.message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new transports.File({
            filename: `logs/${server_name}-${new Date().toISOString().slice(0, 10)}.log`
        })
    ]
});

const activeSockets = {}
const games = {};

let users = [];

io.on('connection', (socket) => {

    activeSockets[socket.id] = socket;
    let language = 'en';

    logger.info({message: `User connected : ${socket.id}`, line:'57', type:'socket', emit:''});


    function searchingTimer(currentGame, user) {

        currentGame.gameTimer = setTimeout(() => {

            if (Object.keys(currentGame.players).length < 2) {

                clearTimeout(currentGame.gameTimer);
                currentGame.gameTimer = null;

                logger.info({message: `Room ${currentGame.config.id} timed out, assigning bot player`, line:'89', type:'socket', emit:''});

                io.to(currentGame.config.id).emit('disable_cancel', { disableCancel: true, status : "found" });

                const botPlayer = generateBotPlayer(user.prop.trophy);

                currentGame.config.withBot = true;

                currentGame.players[botPlayer.prop.id] = botPlayer;

                currentGame.isGameStart = true;
                
                logger.info({message: ` `, emit:'game_joined', line:'98', type:'emit'});
                io.to(currentGame.config.id).emit('game_joined', { opponent : botPlayer, status : "found" });

                logger.info({message: ` `, emit:'game_generating', line:'107', type:'emit'});
                io.to(currentGame.config.id).emit('game_generating', { serverGameStart: currentGame.isGameStart, status : "generate" });

                async function updateGame(currentGame) {
                    currentGame.match.questions = await generateQuestions(currentGame.config.maxQuestions, language, currentGame.config.baseTrophy);
                  
                    const emits = [
                        io.to(currentGame.config.id).emit('game_ready', { status: "ready" }),
                        logger.info({message: `Room ${currentGame.config.id} start match`, line:'204', type:'socket', emit:''}),
                    ];
                  
                    await Promise.all(emits);
                }

                // Utilizzo della funzione updateGame
                updateGame(currentGame);
                
            } else {
                logger.info({message: `Room ${currentGame.config.id} has two players now, cancelling timer`, line:'115', type:'socket', emit:''});
            }
        }, currentGame.config.timeLeft * 1000);
    }

    function getUserId(gameID, useruid) {
        let connected_userid = '';

        Object.values(games[gameID].players).forEach((user, index) => {
            if(user.prop.uid === useruid) {
                connected_userid = user.prop.id;
            }
        });
        return connected_userid;
    }


    function startTurn(gameID) {
        
        if(!hasOfflinePlayer(gameID)) {

            if(games[gameID].isMatchRunning && !games[gameID].isStopped) {

                games[gameID].match.countdown.enable = true;
                games[gameID].isTurnRunning = true;
                games[gameID].match.state.turn++

                let noOfQuestions = games[gameID].match.questions.set.length;
                let question = games[gameID].match.questions.set[games[gameID].match.currentQuestion];
                
                games[gameID].match.state.score[games[gameID].match.currentQuestion] = {};

                Object.keys(games[gameID].players).forEach((key) => {
                    games[gameID].players[key].conn.turn += 1;
                    games[gameID].players[key].conn.send = false;
                });

                io.to(gameID).emit('new_turn', { opponentResponse: false, turn: games[gameID].match.state.turn, status : "new_turn" });

                setTimeout(() => {

                    // Invia i dati necessari al giocatore
                    io.to(gameID).emit('get_question', { question, noOfQuestions, currentQuestion: games[gameID].match.currentQuestion, countdown: games[gameID].match.countdown, status : "get_question" });
                    
                    // Imposta un timer per il turno del giocatore successivo
                    games[gameID].turnTimer = setInterval(() => {
                        if(games[gameID].match.countdown.enable) {

                            Object.entries(games[gameID].players).filter(([key, value]) => value.prop.bot).forEach(([key, value]) => {
                                let botid = value.prop.id;

                                let question = games[gameID].match.questions.results[games[gameID].match.currentQuestion];
                                // bot answer to question
                                let text_answer = botAnswer(question, games[gameID].config.baseTrophy)
                
                                    const answer = {
                                        answer: text_answer,
                                        time: calcTime(gameID),
                                        correct: calcCorrect(gameID,text_answer)
                                    };
                    
                                    //games[gameID].match.score[games[gameID].match.currentQuestion][userid].answer time correct
                                    games[gameID].match.state.score[games[gameID].match.currentQuestion][botid] = answer;
                                    games[gameID].players[botid].conn.send = true;
                    
                                    //logger.info({message: ` `, emit:'game_joined', line:'181', type:'emit'});
                                    io.to(gameID).emit('opponent_has_answered', { opponentResponse: games[gameID].players[botid].conn.send, status : "opponent_has_answered" });

                            })
                    
                            if(games[gameID].match.countdown.second === 0) {

                                Object.entries(games[gameID].players).filter(([key, value]) => !value.conn.send).forEach(([key, value]) => {
                                    io.to(games[gameID].players[key].prop.id).emit('time_up', { status : "time_up" });
                                })
                                Object.entries(games[gameID].players).filter(([key, value]) => value.conn.send).forEach(([key, value]) => {
                                    io.to(games[gameID].players[key].prop.id).emit('end_turn', { opponentResponse: false, status : "waiting_turn" });
                                })

                                endTurn(gameID, false);
                            }

                            io.to(gameID).emit('update_timer', { countdown: games[gameID].match.countdown, status : "update_timer" });
                            
                            games[gameID].match.countdown.second -= 1

                        }
                    }, 1000)

                }, 1600)

            }

        } else {
            
            io.to(gameID).emit('game_stopped', { status : "opponent_disconnected" });


            //lanciare messaggio di fine partita con vincite
            const offlineP = getOfflinePlayer(gameID);
            const onlineP = getOnlinePlayer(gameID);

                let result = {
                    [offlineP]: {
                        answeredQuestion: 0,
                        notansweredQuestion: 0,
                        correctAnswers:0,
                        wrongAnswers:0
                    },
                    [onlineP]: {
                        answeredQuestion: 0,
                        notansweredQuestion: 0,
                        correctAnswers:0,
                        wrongAnswers:0
                    }
                }

                //games[gameID].match.score[games[gameID].match.currentQuestion][userid].answer time correct
                games[gameID].isStopped = true;
                games[gameID].isMatchRunning = false;

                for(let i = 0; i < 8; i++) {

                    if(games[gameID].match.state.score[i]) {
                        
                        if(games[gameID].match.state.score[i][offlineP]) {
                            if(games[gameID].match.state.score[i][offlineP].answer !== -1) {
                                result[offlineP].answeredQuestion += 1;
        
                                if(games[gameID].match.state.score[i][offlineP].correct) {
                                    result[offlineP].correctAnswers += 1;
                                } else {
                                    result[offlineP].wrongAnswers += 1;
                                }
                            } else {
                                result[offlineP].notansweredQuestion += 1;
                                result[offlineP].wrongAnswers += 1;
                            }
                        } else {
                            result[offlineP].notansweredQuestion += 1;
                            result[offlineP].wrongAnswers += 1;
                        }

                        if(games[gameID].match.state.score[i][onlineP]) {
                            if(games[gameID].match.state.score[i][onlineP].answer !== -1) {
                                result[onlineP].answeredQuestion += 1;
        
                                if(games[gameID].match.state.score[i][onlineP].correct) {
                                    result[onlineP].correctAnswers += 1;
                                } else {
                                    result[onlineP].wrongAnswers += 1;
                                }
                            } else {
                                result[onlineP].notansweredQuestion += 1;
                                result[onlineP].wrongAnswers += 1;
                            }
                        } else {
                            result[onlineP].notansweredQuestion += 1;
                            result[onlineP].wrongAnswers += 1;
                        }

                    } else {
                        result[offlineP].notansweredQuestion += 1;
                        result[offlineP].wrongAnswers += 1;

                        result[onlineP].notansweredQuestion += 1;
                        result[onlineP].wrongAnswers += 1;
                    }
                }

                
                console.log(result)

                games[gameID].match.state.winner = onlineP;

                let opponentPoints = Math.ceil( (result[onlineP].correctAnswers * 3) + (result[onlineP].notansweredQuestion * 3) );
                let yourPoints = -(Math.ceil( (result[offlineP].wrongAnswers * 3) / 2 ));
                const scoreToYou = {
                    your: result[offlineP].correctAnswers,
                    opponent: result[onlineP].correctAnswers
                }
                const scoreToOpponent = {
                    your: result[onlineP].correctAnswers,
                    opponent: result[offlineP].correctAnswers
                }

                const profileService = new ProfileService();
                profileService.updateTrophies(games[gameID].players[offlineP].prop.uid, yourPoints);
                if(!games[gameID].players[onlineP].prop.bot) {
                    profileService.updateTrophies(games[gameID].players[onlineP].prop.uid, opponentPoints);
                }

                io.to(gameID).emit('opponent_concede', {score: scoreToOpponent, state: 'win', points: opponentPoints, status:"opponentConceded"})

                io.socketsLeave(gameID);
        }
    }

    // endTurn(gameID, bool) => true: entrambi hanno risposto, false: tempo scaduto
    function endTurn(gameID, typeEnd) {
        //tempo scaduto
        if(typeEnd) {
            io.to(gameID).emit('end_turn', { opponentResponse: false, status : "waiting_turn" });
        }

        clearTimeout(games[gameID].turnTimer);
        games[gameID].isTurnRunning = false;
        games[gameID].turnTimer = null;

        games[gameID].match.countdown.enable = false;
        games[gameID].match.countdown.second = games[gameID].match.countdown.max;

        //CHECK RISPOSTE DATE E NON DATE, + TIMER PER POSTICIPARE IL NUOVO TURNO
        //games[gameID].players[userid].send per verificare se ha risposto o no
        const answer = {
            answer: -1,
            time: games[gameID].match.countdown.max ,
            correct: false
        };
        
        Object.keys(games[gameID].players).forEach((key) => {
            if(!games[gameID].players[key].conn.send) {

                games[gameID].match.state.score[games[gameID].match.currentQuestion][key] = answer;      
                games[gameID].players[key].conn.send = true;
            }
        });

        //games[gameID].match.score[games[gameID].match.currentQuestion][userid].answer time correct


        
        games[gameID].match.currentQuestion += 1;


        // Chiamata alla funzione per gestire la fine della partita
        if(games[gameID].match.questions.set.length === games[gameID].match.state.turn && games[gameID].match.questions.set.length === games[gameID].match.currentQuestion) {
            handleMatchEnd(gameID);
        }

        setTimeout(() => {
            // Avvia il turno del prossimo giocatore
            if(games[gameID].isMatchRunning) {
                startTurn(gameID);
            }

        },1600);
    }

    function handleMatchEnd(gameID) {
            //handleEndGame()
            games[gameID].isGameStart = false;

            games[gameID].isMatchRunning = false;
            games[gameID].isStopped = true;

            console.log("end game");

            //io.to(gameID).emit('game_end', { status : "game_end" });

            //lanciare messaggio di fine partita con vincite
            const onlinePlayers = getOnlinePlayer(gameID);

            let result = {}
            onlinePlayers.forEach((player, index) => {
                let p = {
                    answeredQuestion: 0,
                    notansweredQuestion: 0,
                    correctAnswers:0,
                    wrongAnswers:0
                }

                result[player] = p


                for(let i = 0; i < 8; i++) {

                    if(games[gameID].match.state.score[i]) {
                        
                        if(games[gameID].match.state.score[i][player]) {
                            if(games[gameID].match.state.score[i][player].answer !== -1) {
                                result[player].answeredQuestion += 1;
        
                                if(games[gameID].match.state.score[i][player].correct) {
                                    result[player].correctAnswers += 1;
                                } else {
                                    result[player].wrongAnswers += 1;
                                }
                            } else {
                                result[player].notansweredQuestion += 1;
                                result[player].wrongAnswers += 1;
                            }
                        } else {
                            result[player].notansweredQuestion += 1;
                            result[player].wrongAnswers += 1;
                        }

                    } else {
                        result[player].notansweredQuestion += 1;
                        result[player].wrongAnswers += 1;
                    }
                }

            });

            let max = 0;
            let winner = '';
            let loser = '';
            let tie = false;
            Object.keys(result).forEach((player, index) => {
                if(result[player].correctAnswers > max) {
                    max = result[player].correctAnswers;
                    winner = player;
                    tie = false;
                } else if(result[player].correctAnswers == max) {
                    tie = true;
                } else {
                    tie = false;
                }
            })
        
            console.log(result)

            if(tie) {
                games[gameID].match.state.winner = 'tie';

                Object.keys(result).forEach((player, index) => {
                    let winnerPoints = Math.ceil( (result[player].correctAnswers * 3) );
                    const scoreToWinner = {
                        your: result[player].correctAnswers,
                        opponent: result[player].correctAnswers
                    }
                    const profileService = new ProfileService();
                    if(!games[gameID].players[player].prop.bot) {
                        profileService.updateTrophies(games[gameID].players[player].prop.uid, winnerPoints);
                    }
                    io.to(player).emit('game_over_reward', {score: scoreToWinner, state: 'draw', points: winnerPoints, status:"game_end"})
                })

            } else {
                if(!tie) {
                    loser = Object.keys(result).filter((p) => p !== winner)
                }

                games[gameID].match.state.winner = winner;

                let winnerPoints = Math.ceil( (result[winner].correctAnswers * 3) );
                let loserPoints = -(Math.ceil( (result[loser].wrongAnswers * 3) / 2 ));

                const scoreToWinner = {
                    your: result[winner].correctAnswers,
                    opponent: result[loser].correctAnswers
                }
                const scoreToLoser = {
                    your: result[loser].correctAnswers,
                    opponent: result[winner].correctAnswers
                }

                const profileService = new ProfileService();
                if(!games[gameID].players[winner].prop.bot) {
                    profileService.updateTrophies(games[gameID].players[winner].prop.uid, winnerPoints);
                }
                if(!games[gameID].players[loser].prop.bot) {
                    profileService.updateTrophies(games[gameID].players[loser].prop.uid, loserPoints);
                }

                io.to(winner).emit('game_over_reward', {score: scoreToWinner, state: 'win', points: winnerPoints, status:"game_end"})
                io.to(loser).emit('game_over_reward', {score: scoreToLoser, state: 'lose', points: loserPoints, status:"game_end"})


            }
                
            
            io.socketsLeave(gameID);

            // disconnect players
    }   


    
    function calcTime(gameID) {
        let time = games[gameID].match.countdown.max - games[gameID].match.countdown.second;
        return time;
    }

    function calcCorrect(gameID,answer) {
        //for(let x = 0; x < games[gameID].config.maxQuestions; x++ ) { }

        if(games[gameID].match.questions.results[games[gameID].match.currentQuestion].correct_answer === answer) {
            return true
        }
        return false;
    }

    function hasOfflinePlayer(gameID) {
        return Object.values(games[gameID].players).some(player => !player.conn.online);
    }

    function getOfflinePlayer(gameID) {
        return Object.values(games[gameID].players).filter(player => !player.conn.online).map(player => player.prop.id);
    }
    function getOnlinePlayer(gameID) {
        return Object.values(games[gameID].players).filter(player => player.conn.online).map(player => player.prop.id);
    }
    
    function getGameId(socketId) {
        let gameID;
        let player;
        for (const [id, game] of Object.entries(games)) {
            player = game.players[socketId];

            if (player) {
                gameID = game.config.id;
                break;
            }
        }
        return [gameID, player];
    }

    function performDisconnection (socketId) { 
        // cerco la partita a cui l'utente era connesso
        const [gameID, player] = getGameId(socketId);

        // se l'utente era connesso ad una partita, lo rimuovo dalla partita
        if (gameID) {

            if(!games[gameID].isGameStart) {

                clearTimeout(games[gameID].gameTimer);
                games[gameID].gameTimer = null;

                delete games[gameID].players[player.prop.id];

                socket.leave(gameID);

                logger.info({message: `Player ${player.prop.id} removed from matchmaking ${gameID}`, line:'254', type:'socket', emit:''});
                
                logger.info({message: `Match ${gameID} terminated `, line:'262', type:'socket', emit:''});

                //la stanza è da rimuovere
            } else { 
                //clearTimeout(games[gameID].turnTimer);
                //games[gameID].turnTimer = null;

                socket.leave(gameID);

                games[gameID].players[player.prop.id].conn.online = false;
                games[gameID].players[player.prop.id].conn.state = 'disconnect';
                //io.to(gameID).emit('game_stopped', { status : "opponent_disconnected" });


                // ##########################

                
                //disconnetto anche l'altro utente
                //io.in(gameID).disconnectSockets(true);

                //io.in(gameID).disconnectSockets(true);


                //emitto all'utente corrente lo stato del gioco della sua partita (se ha vinto guadagnerà punti nel client e vice versa)

                /*
                logger.info({message: ` `, emit:'game_leaving', line:'246', type:'emit'});
                socket.emit('match_leaving', { status: "leave" });

                logger.info({message: `Utente ${player.prop.id} rimosso dalla partita ${gameID}`, line:'254', type:'socket', emit:''});
                //comunca all'oppo che l'altro utente è disconnesso e cancella il match
                io.to(gameID).emit('match_cancel', { status: "cancel" });
                    
                logger.info({message: `Match ${gameID} terminated : user ${player.prop.email} disconnecting`, line:'262', type:'socket', emit:''});

                //stabilisco i punti da assegnare, e li salvo nello stato del gioco
                //emitto all'utente corrente lo stato del gioco della sua partita (se ha vinto guadagnerà punti nel client e vice versa)


                logger.info({message: ` `, emit:'game_leaving', line:'246', type:'emit'});
                socket.emit('match_leaving', { status: "leave" });

                logger.info({message: `Utente ${player.prop.id} rimosso dalla partita ${gameID}`, line:'254', type:'socket', emit:''});
                //comunca all'oppo che l'altro utente è disconnesso e cancella il match
                io.to(gameID).emit('match_cancel', { status: "cancel" });
                    
                logger.info({message: `Match ${gameID} terminated : user ${player.prop.email} disconnecting`, line:'262', type:'socket', emit:''});

                //stabilisco i punti da assegnare, e li salvo nello stato del gioco
                    if(games[gameID].isStopped) {
                        delete games[gameID];
                    
                        console.log(`[socket:line:195] Disconnected user: ${socket.id}`)
                        delete activeSockets[socket.id];
                        
                        logger.info({message: `List of all opens game : ${Object.keys(games).length}`, line:'274', type:'socket', emit:''});
        
                        clearTimeout(deleteTimer);
                        deleteTimer = null;
                    }
                */
            }

        } 

    };



    socket.on('request_join_room', (data) => {
        logger.info({message: `List of all games : ${Object.keys(games).length}`, line:'121', type:'socket', emit:''});

        language = data.language;
        const user = {
            prop: {
                id: socket.id,
                uid: data.profileUid,
                email: data.profileEmail,
                photo: data.profilePhoto,
                trophy: data.profileTrophy,
                bot: false,
            },
            conn: {
                //state : online, ready, disconnect, concede
                state: 'online',
                online: true,
                ready: false,
                turn: 0,
                send: false,
                launchEmoticon: false
            }
        }

        let gameID = null;
        for (const [id, game] of Object.entries(games)) {
            if(game.isAvailable) {
                if (Object.keys(game.players).length < 2) {
                    if( Math.abs(game.config.baseTrophy - user.prop.trophy) <= 500) {
                        games[id].config.baseTrophy = (game.config.baseTrophy + user.prop.trophy) / 2;
                        gameID = id.toString();
                        logger.info({message: `Room available : ${gameID}`, line:'136', type:'socket', emit:''});
                        break;
                    }
                }
            }
        }

        if (!gameID) {
            gameID = uuidv4().toString();
            games[gameID] = {
                isStopped: false,
                isAvailable: true,
                gameTimer: false,
                turnTimer: false,
                isMatchRunning: false,
                isTurnRunning: false,
                isGameStart: false,
                config : {
                    id: gameID,
                    maxQuestions: 8,
                    withBot: false,
                    timeLeft: 20,
                    baseTrophy: user.prop.trophy
                },
                match : {
                    questions: [/* array of 10 questions and answers */],
                    currentQuestion: 0,
                    state: {
                        end: false,
                        turn: 0,
                        score: [],
                        winner: null
                    },
                    countdown: {
                        enable: false,
                        second: 15,
                        max: 15
                    }
                },
                players: {}
            };

            logger.info({message: `Room created : ${gameID}`, line:'166', type:'socket', emit:''});

            socket.emit('game_created', { status : "search"})
        }

        const game = games[gameID];

        // add player to game
        games[gameID].players[user.prop.id] = user;

        logger.info({message: ` `, emit:'player_connected', line:'174', type:'emit'});
        socket.emit('player_connected', { config : games[gameID].config, player : user, status : "connect"})

        // join the game room
        socket.join(gameID);

        logger.info({message: `Player ${user.prop.id} joined room ${gameID}`, line:'177', type:'socket', emit:''});

        if (Object.keys(games[gameID].players).length === 2) {

            if (games[gameID].gameTimer) {
                clearTimeout(game.gameTimer);
                game.gameTimer = null;

                logger.info({message: `Room ${gameID} has two players now, cancelling timer`, line:'188', type:'socket', emit:''});

                io.to(gameID).emit('disable_cancel', { disableCancel: true, status : "found" });
            }

            games[gameID].isGameStart = true;

            const opponent = Object.entries(games[gameID].players)
                .filter(([id, p]) => id !== user.prop.id)
                .map(([id, p]) => p)[0]

            socket.emit('game_joined', { opponent : opponent, status : "found" });

            socket.to(gameID).emit('game_joined', { opponent : user, status : "found" });

            io.to(gameID).emit('game_generating', { serverGameStart: games[gameID].isGameStart, status : "generate" });

            async function updateGame() {
                games[gameID].match.questions = await generateQuestions(games[gameID].config.maxQuestions, language, games[gameID].config.baseTrophy);
                
                const emits = [
                    io.to(gameID).emit('game_ready', { status: "ready" }),
                    logger.info({message: `Room ${gameID} start match`, line:'204', type:'socket', emit:''})
                ];
            
                await Promise.all(emits);
            }

            updateGame();

        } else {
            //start 30 second timer before add a bot to the match
            logger.info({message: `Starting timer for room ${gameID}`, line:'212', type:'socket', emit:''});

            io.to(gameID).emit('game_waiting', { status : "search" })
            
            searchingTimer(games[gameID], user);
        }

        

    });


    

    socket.on('loading_start_game', (data) => {
        const gameID = data.gameId;
        const userid = getUserId(gameID, data.useruid);

        if(!hasOfflinePlayer(gameID)) {

            let ready = data.ready;

            games[gameID].players[userid].conn.ready = ready;
            games[gameID].players[userid].conn.state = 'ready';

            if(games[gameID].config.withBot) {
                const opponentid = Object.keys(games[gameID].players)
                .filter((i) => i !== userid)
                .map((i) => i)[0]

                if(games[gameID].players[opponentid].prop.bot) {
                    games[gameID].players[opponentid].conn.ready = ready;
                    games[gameID].players[opponentid].conn.state = 'ready';
                }
            }

            if( Object.values(games[gameID].players).every(player => player.conn.ready == true) ) {

                if(!games[gameID].isMatchRunning) {
                    games[gameID].isMatchRunning = true;

                    logger.info({message: `Both player are ready ${games[gameID].config.id}`, line:'251', type:'socket', emit:''});
                    startTurn(gameID);
                }

            } else {
                logger.info({message: `One or both players aren't ready ${games[gameID].config.id}`, line:'266', type:'socket', emit:''});
            }
        
        } else {
            
            //il metodo ne rileva almeno uno offline, il messaggio viene emesso a entrambi : 
            //l'offline non riceve nulla, l'online riceve che si è disconnesso l'avversario
            io.to(gameID).emit('game_stopped', { status : "opponent_disconnected" });

            //lanciare messaggio di fine partita con vincite

            const opponentid = Object.keys(games[gameID].players)
                .filter((i) => i !== userid)
                .map((i) => i)[0]

                let result = {
                    [userid]: {
                        answeredQuestion: 0,
                        notansweredQuestion: 0,
                        correctAnswers:0,
                        wrongAnswers:0
                    },
                    [opponentid]: {
                        answeredQuestion: 0,
                        notansweredQuestion: 0,
                        correctAnswers:0,
                        wrongAnswers:0
                    }
                }

                //games[gameID].match.score[games[gameID].match.currentQuestion][userid].answer time correct
                games[gameID].isStopped = true;
                games[gameID].isMatchRunning = false;

                for(let i = 0; i < 8; i++) {

                    if(games[gameID].match.state.score[i]) {
                        
                        if(games[gameID].match.state.score[i][userid]) {
                            if(games[gameID].match.state.score[i][userid].answer !== -1) {
                                result[userid].answeredQuestion += 1;
        
                                if(games[gameID].match.state.score[i][userid].correct) {
                                    result[userid].correctAnswers += 1;
                                } else {
                                    result[userid].wrongAnswers += 1;
                                }
                            } else {
                                result[userid].notansweredQuestion += 1;
                                result[userid].wrongAnswers += 1;
                            }
                        } else {
                            result[userid].notansweredQuestion += 1;
                            result[userid].wrongAnswers += 1;
                        }

                        if(games[gameID].match.state.score[i][opponentid]) {
                            if(games[gameID].match.state.score[i][opponentid].answer !== -1) {
                                result[opponentid].answeredQuestion += 1;
        
                                if(games[gameID].match.state.score[i][opponentid].correct) {
                                    result[opponentid].correctAnswers += 1;
                                } else {
                                    result[opponentid].wrongAnswers += 1;
                                }
                            } else {
                                result[opponentid].notansweredQuestion += 1;
                                result[opponentid].wrongAnswers += 1;
                            }
                        } else {
                            result[opponentid].notansweredQuestion += 1;
                            result[opponentid].wrongAnswers += 1;
                        }

                    } else {
                        result[userid].notansweredQuestion += 1;
                        result[userid].wrongAnswers += 1;

                        result[opponentid].notansweredQuestion += 1;
                        result[opponentid].wrongAnswers += 1;
                    }
                }

                
                console.log(result)

                games[gameID].match.state.winner = opponentid;

                let opponentPoints = Math.ceil( (result[opponentid].correctAnswers * 3) + (result[opponentid].notansweredQuestion * 3) );
                let yourPoints = -(Math.ceil( (result[userid].wrongAnswers * 3) / 2 ));
                const scoreToYou = {
                    your: result[userid].correctAnswers,
                    opponent: result[opponentid].correctAnswers
                }
                const scoreToOpponent = {
                    your: result[opponentid].correctAnswers,
                    opponent: result[userid].correctAnswers
                }

                const profileService = new ProfileService();
                if(!games[gameID].players[userid].prop.bot) {
                    profileService.updateTrophies(games[gameID].players[userid].prop.uid, yourPoints);
                }
                profileService.updateTrophies(games[gameID].players[opponentid].prop.uid, opponentPoints);
                
                io.to(gameID).emit('opponent_concede', {score: scoreToOpponent, state: 'win', points: opponentPoints, status:"opponentConceded"})

                io.socketsLeave(gameID);
        }




        socket.on('player_answer', (data) => {
            //manca controllo per verificare se si ha risposto alla stessa domanda del server ********
            if(games[gameID].isTurnRunning) {
                
                const answer = {
                    answer: data.answer,
                    time: calcTime(gameID),
                    correct: calcCorrect(gameID, data.answer)
                };

                //games[gameID].match.score[games[gameID].match.currentQuestion][userid].answer time correct
                games[gameID].match.state.score[games[gameID].match.currentQuestion][userid] = answer;
                games[gameID].players[userid].conn.send = true;

                //se l'avversario ha gia risposto
                const allAlreadyAnswered = Object.values(games[gameID].players).every(player => player.conn.send);
                if(allAlreadyAnswered) {
                    
                    endTurn(gameID, true);
                } else {
                    //logger.info({message: ` `, emit:'game_joined', line:'181', type:'emit'});
                    socket.emit('player_has_answered', { status : "waiting_opponent" });

                    //logger.info({message: ` `, emit:'game_joined', line:'181', type:'emit'});
                    socket.to(gameID).emit('opponent_has_answered', { opponentResponse: games[gameID].players[userid].conn.send, status : "opponent_has_answered" });
                }

            } else {
                console.log("risposta a tempo scaduto")
            }
        });

        socket.on('send_emoticon', (emoticonId) => {
            if(games[gameID].players[userid].conn.launchEmoticon === false) {
                games[gameID].players[userid].conn.launchEmoticon = true;

                const emoticon = stickers.filter(stick => stick.id === emoticonId)[0];

                socket.to(gameID).emit('received_emoticon', {emoticon: emoticon })
    
                setTimeout(() => {
                    socket.to(gameID).emit('stop_emoticon', {emoticon: null });
                    games[gameID].players[userid].conn.launchEmoticon = false;
                },4000)
            }

        });


        socket.on('request_concede', () => {

            const opponentid = Object.keys(games[gameID].players)
                .filter((i) => i !== userid)
                .map((i) => i)[0]

            let result = {
                [userid]: {
                    answeredQuestion: 0,
                    notansweredQuestion: 0,
                    correctAnswers:0,
                    wrongAnswers:0
                },
                [opponentid]: {
                    answeredQuestion: 0,
                    notansweredQuestion: 0,
                    correctAnswers:0,
                    wrongAnswers:0
                }
            }

            games[gameID].players[userid].conn.state = 'concede';
            //games[gameID].match.score[games[gameID].match.currentQuestion][userid].answer time correct
            games[gameID].isStopped = true;
            games[gameID].isMatchRunning = false;

            for(let i = 0; i < 8; i++) {

                if(games[gameID].match.state.score[i]) {
                    
                    if(games[gameID].match.state.score[i][userid]) {
                        if(games[gameID].match.state.score[i][userid].answer !== -1) {
                            result[userid].answeredQuestion += 1;
    
                            if(games[gameID].match.state.score[i][userid].correct) {
                                result[userid].correctAnswers += 1;
                            } else {
                                result[userid].wrongAnswers += 1;
                            }
                        } else {
                            result[userid].notansweredQuestion += 1;
                            result[userid].wrongAnswers += 1;
                        }
                    } else {
                        result[userid].notansweredQuestion += 1;
                        result[userid].wrongAnswers += 1;
                    }

                    if(games[gameID].match.state.score[i][opponentid]) {
                        if(games[gameID].match.state.score[i][opponentid].answer !== -1) {
                            result[opponentid].answeredQuestion += 1;
    
                            if(games[gameID].match.state.score[i][opponentid].correct) {
                                result[opponentid].correctAnswers += 1;
                            } else {
                                result[opponentid].wrongAnswers += 1;
                            }
                        } else {
                            result[opponentid].notansweredQuestion += 1;
                            result[opponentid].wrongAnswers += 1;
                        }
                    } else {
                        result[opponentid].notansweredQuestion += 1;
                        result[opponentid].wrongAnswers += 1;
                    }

                } else {
                    result[userid].notansweredQuestion += 1;
                    result[userid].wrongAnswers += 1;

                    result[opponentid].notansweredQuestion += 1;
                    result[opponentid].wrongAnswers += 1;
                }
            }

            
            console.log(result)

            games[gameID].match.state.winner = opponentid;

            let opponentPoints = Math.ceil( (result[opponentid].correctAnswers * 3) + (result[opponentid].notansweredQuestion * 3) );
            let yourPoints = -(Math.ceil( (result[userid].wrongAnswers * 3) / 2 ));
            const scoreToYou = {
                your: result[userid].correctAnswers,
                opponent: result[opponentid].correctAnswers
            }
            const scoreToOpponent = {
                your: result[opponentid].correctAnswers,
                opponent: result[userid].correctAnswers
            }

            const profileService = new ProfileService();
            profileService.updateTrophies(games[gameID].players[userid].prop.uid, yourPoints);
            if(!games[gameID].players[opponentid].prop.bot) {
                profileService.updateTrophies(games[gameID].players[opponentid].prop.uid, opponentPoints);
            }

            socket.emit('you_concede', {score: scoreToYou, state: 'lose', points: yourPoints, status:"conceded"})
            socket.to(gameID).emit('opponent_concede', {score: scoreToOpponent, state: 'win', points: opponentPoints, status:"opponentConceded"})

            io.socketsLeave(gameID);
        });

    });

    

    socket.on('request_disconnection', (data) => {
        const gameID = data.gameId;
        const userid = getUserId(gameID, data.useruid);
        logger.info({message: `Request disconnect event from ${userid}`, line:'279', type:'socket', emit:''});
        games[gameID].players[userid].conn.online = false;
        games[gameID].players[userid].conn.state = 'disconnect';
        socket.disconnect();
    });

    socket.on('disconnect', () => {
        const [gameID] = getGameId(socket.id);
        logger.info({message: `Disconnect event for ${socket.id}`, line:'284', type:'socket', emit:''});
        io.to(gameID).emit('game_cancel', { status: "cancel" });
        
        performDisconnection(socket.id);        
    });


});

http.on('close', () => {
    Object.values(activeSockets).forEach(socket => {
        socket.disconnect();
    });
});

const server = http.listen(process.env.PORT || 3000, '0.0.0.0', () => {
    const { port } = server.address();
    logger.info({message: `Listening on port ${port}`, line:'299', type:'socket', emit:''});
});

console.log(`store into ${server_name}-${new Date().toISOString().slice(0, 10)}.log start`);