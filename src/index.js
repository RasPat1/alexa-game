'use strict';

/*******************************************************
* Intialize App
********************************************************/

var Alexa = require('alexa-sdk');

//Twilio info
var accountSid = 'AC2a896186008e9b0cad3bdd16831006e7';
var authToken = 'e21d773eb1ed8769629890e0a4fc38fd';
var fromNumber = '6317598355';
var client = require('twilio')(accountSid, authToken);

// App Specific Info
var APP_ID = "amzn1.ask.skill.78c5e44b-3bb9-4710-a59d-cb8a34d32793";
var SKILL_NAME = 'Catskill';

// Boilerplate Alexa
exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.appId = APP_ID;
    alexa.registerHandlers(handlers);
    alexa.execute();
};

/*******************************************************
* Game State
********************************************************/

var characterNames = {VILLAGER: 'villager', VILLAIN: 'werecat', DOCTOR: 'doctor'};

var config = {
    allCharacters: [characterNames.VILLAGER, characterNames.VILLAIN, characterNames.DOCTOR],
    characterActionExecutionOrder: [characterNames.VILLAGER, characterNames.DOCTOR, characterNames.VILLAIN],
    characters: [
        {
            name: characterNames.VILLAGER,
            nightAction: ['run', 'hide'],
            description: ['You are a villager! At night text what you want to to do! For example: \'Hide in the shed\''],
            isVillain: false
        },
        {
            name: characterNames.DOCTOR,
            nightAction: ['protect'],
            description: ['You are a Doctor! At night text the name of who you want to protect.'],
            isVillain: false
        },
        {
            name: characterNames.VILLAIN,
            nightAction: ['kill'],
            description: ['You are a Werewolf! At night text the name of who you want to kill.'],
            isVillain: true
        }
    ],
    players: [
        /* sample
            {
                number: "7732264075",
                character: 'werewolf',
                name: 'Ras',
                isAlive: true,
                customDeath: 'Hide in Shed' // Optional for funnier death messages (usually villagers)
            }
        */
    ],
    protectedPlayerNames: [],
    nightDeathCharacter: null, // updated everynight if someone died
    state: {
        roundNumber: 0,
        charactersAssigned: false,
        gameOver: false,
        villainWin: false,
        heroWin: false,
        phase: 0
    },
    history: {  // history of the game
        askForNumberStart: null,
        askForNumberEnd: null,
        rounds: [
        /* sample
            {
                dayKillVoteStart: 12341234123,
                dayKillVoteEnd: 12312312342,

                nightActionStart: 1345345,
                nightActionEnd: 123412315
            }
        */
        ]
    }
};


/*******************************************************
* Game Flow
********************************************************/

// Start Game
// Add Players
// Assign Characters
// Loop
    // Tell what happened last night
    // Start deliberation
    // Kill a player via the mob
    // Transition to night
    // Get player actions
    // Resolve player Action effects
        // Kill a player or Do nothing
// End Game


// chunked Game
function startGame() {
    config.history.phase = 0;
    config.history.askForNumberStart = Date.now();
}

function receivedPhoneNumbers() {
    config.history.phase = 1;
    config.history.askForNumberEnd = Date.now();
    var players = getPlayersFromTwilio(config.history.askForNumberStart, config.history.askForNumberEnd);

    for (player in players) {
        addPlayer(player.name, player.phoneNumber);
    }

    setCharacters();

    startRound();

}

function startRound() {
    config.history.phase = 2;
    var roundHistory = {};  
    var actions = [];
    var votes = [];
    config.protectedPlayers = []; // Clear protectedPlayers at start of each round
    config.roundNumber = config.roundNumber++;
}

function endDeliberationStartVoting() {
    config.history.phase = 3;
    roundHistory.dayKillVoteStart = Date.now();
}

function endVotingStartNight() {
    config.history.phase = 4;
    roundHistory.dayKillVoteEnd = Date.now();

    votes = getPlayerVotesFromTwilio(roundHistory.dayKillVoteStart, roundHistory.dayKillVoteEnd);
    var deadPlayerName = resolveVotes(votes);
    resolveDeath(deadPlayerName);

    evaluateEndCondition();

    roundHistory.nightActionStart = Date.now();
}

function endNight() {
    config.history.phase = 5;
    
    roundHistory.nightActionEnd = Date.now();
    config.history.rounds.push(roundHistory);

    actions = getPlayerActionsFromTwilio(roundHistory.nightActionStart, roundHistory.nightActionEnd);
    resolvePlayerActions(actions);
    evaluateEndCondition();

    // there's going to be a bug here
    if (!config.state.gameOver) {
        startRound();
    }
}

/*******************************************************
* Game Play Functions
********************************************************/

// Add players once their phone number is received
function addPlayer(name, phoneNumber) {
    var newPlayer = {
        number: phoneNumber,
        name: name.toLowerCase(),
        isAlive: true
    };

    config.players.push(newPlayer);
}

// Assign Characters once all players have been added
// Call only once per game
function setCharacters() {
    if (config.charactersAssigned == true) { // This almost certainly will never get triggered
        // TODO: Handle Error
        return;
    }

    // ToDo: getCharacterConfig(var numberOfCharacters)
    var allCharacters = config.allCharacters
    var shuffledCharacters = shuffle(allCharacters); 


    //ToDo: Allow multiple of same characters
    for (character in shuffledCharacters) {
        config.players[i].characterName = character;
    }

    config.charactersAssigned = true;
}

// Kill a player
function killPlayer(name) {
    if (config.protectedPlayerNames.indexOf(name) > -1) {
        config.nightDeathCharacter = null;
        // player does not die, let game know the night was safe
    } else {
        var playerObj = getPlayerInfo(name, 'name');
        playerObj.isAlive = false;
        config.nightDeathCharacter = name;
    }
}

// make a player unkillable
function protectPlayer(playerName) {
    config.protectedPlayerNames.push(playerName);
}

// Determine if game is over (more Werewolves)
function evaluateEndCondition() {
    var villainCount;
    var heroCount;

    for (player in config.players) {
        if (player.isAlive) {
            var characterInfo = getCharacterInfo(player.character);

            if (characterInfo.isVillain == true) {
                villainCount++;
            } else if (characterInfo.isVillain == false) {
                heroCount++;
            }
        }
    }

    var villainWin = villainCount >= heroCount;
    var heroWin = villainCount == 0;

    config.state.villainWin = villainWin;
    config.state.heroWin = heroWin;
    config.state.gameOver = villainWin || heroWin;
}

function resolveVotes(votes) {
    var max = -1;
    var voteCounts = {};
    var playerName;

    for (var vote in votes) {
        if (!voteCounts.hasOwnProperty(vote.name)) {
            voteCounts[vote.name] = 0;
        }
        voteCounts[vote.name]++;
    }

    for (var voteName in voteCounts) {
        if (voteCounts.hasOwnProperty(voteName)) {
            if (voteCounts[voteName] > max) {
                playerName = voteName
            }
        }
    }

    return playerName;
}

function resolveDeath(name) {
    var playerInfo = getPlayerInfo(name, 'name');
    playerInfo.isAlive = false;
}

function resolvePlayerActions(actions) {
    // Augment action to include character for easier sorting
    for (var action in actions) {
        var playerInfo = getPlayerInfo(action.phoneNumber, 'number');
        action.character = playerInfo.character;
    }

    sortByCharacterPriority(actions); // TODO check that the sort modifies the array

    for (action in actions) {
        executeAction(action);
    }
}


// TODO: Need validation here! action.playerAction is overloaded
function executeAction(action) {
    var player = getPlayerInfo(action.playerName, 'name');

    if (player.character == config.character.WEREWOLF) {
        var name = action.playerAction;
        killPlayer(name);
    } else if (player.character == config.character.VILLAGER) {
        player.customDeath = action.playerAction;
    } else if (player.character == config.character.DOCTOR) {
        var protecteeName = action.playerAction;
        protectPlayer(protecteeName);
    }
}

/*******************************************************
* GamePlay Utility Functions
********************************************************/

function getPlayerActions() {
    var actions = [];
    var payloads = getTwilioPayloads();

    for (payload in payloads) {
        var playerNumber = payload.phoneNumber;
        var playerAction = payload.action;
        var playerInfo = getPlayerInfo(playerNumber, 'number');

        var actionObj = {
            playerName: playerInfo.name,
            character: playerInfo.character,
            action: playerAction
        }

        actions.push(actionObj);
    }

    return actions;
}

function sortByCharacterPriority(actions) {
    var order = config.characterActionExecutionOrder;

    actions.sort(function(a, b) {
        return order.indexOf(b.character) - order.indexOf(a.character);
    });
}

function getPlayerInfo(value, prop) {
    var result = {};

    for (var player in config.players) {
        if (player[prop] == value) {
            result = player;
        }
    }

    // TODO: Error handling for no player object found
    return result;
}

function getCharacterInfo(characterName) {
    var characterInfo

    for (character in config.characters) {
        if (char.name == characterName) {
            characterInfo = character;
        }
    }

    // TODO: Error handling for no characer info found
    return characterInfo;
}

function shuffle(array) {
    var j, x, i;
    for (i = array.length; i; i--) {
        j = Math.floor(Math.random() * i);
        x = array[i - 1];
        array[i - 1] = array[j];
        array[j] = x;
    }
}
/*******************************************************
* Alexa Speaks
********************************************************/

// function sayInstructions() {
//     this.emit(':tell', 'If you do not know, now you know.');
// }
// function sayCharacterRoles() {
//     this.emit(':tell', 'if you do not know, now you know.');
// }

// function sayNightDeath() {
//     console.log('sayNightDeath');
//     this.emit(':tell', 'Night death!');
// }
// function sayOutro() {
//     console.log('sayOutro');
//     this.emit(':tell', 'Life moves on. Cats will endure!');
// }
// function sayStartDeliberation() {
//     console.log('sayStartDeliberation');
//     this.emit(':tell', 'You have three minutes to deliberate on who the killer may be. After that time, you will send in your vote. Be wary of your fellow towns people. Everyone is a suspect.');
// }
// function sayEndDeliberation() {
//     console.log('sayEndDeliberation');
//     this.emit(':tell', 'Times up. Send in your vote now!');
// }
// function sayNightStart() {
//     console.log('sayNightStart');
//     this.emit(':tell', 'Night has fallen.');
// }
// function sayNightEnd() {
//     console.log('sayNightEnd');
//     this.emit(':tell', 'Here comes the sun!');
// }

function getNightDeathStory() {
    return "a guy died in the night";
}

/*******************************************************
* Intent Mappping
********************************************************/

var handlers = {
    'LaunchRequest': function () {
        startGame();
        var numberString = getAlexaPhoneNumber();
        // TODO: Get audio tags to work
        this.emit(':tell', "<audio>https://s3.amazonaws.com/catskill/win_cat_theme2.mp3</audio> Welcome to Catville. A place known far and wide for it’s rolling hills, humble architecture, and endless supply of yarn. The citizens of this quaint little village have lived here in peace for decades. That is… until last night. All players, text your name to " + numberString + " to begin the cat hunt and tell me when you're ready to win this motherfucker.");
    },
    'PhoneNumberContinueIntent': function () {
        receivedPhoneNumbers();
        this.emit(':tell', 'Sheriff Katz was found murdered early this morning, locked in one of his own cells. His throat slit and traces of white foam down his neck. We have a rabies infected murderer on the loose!  What the fuck do we do?! The town has congregated at the court house to deliberate on what to do. You have three minutes to deliberate on who the killer may be. After that time, you will send in your vote. Be wary of your fellow towns people. Everyone is a suspect. Begin deliberating now!');
    },
    'endDeliberationIntent': function () {
        endDeliberation();
        this.emit(':tell', 'Times up. Send in your vote now!');
    },
    'endVotingStartNightIntent': function () {
        endVotingStartNight();
        if (config.state.gameOver) {
            this.emit(':tell', 'Life moves on. Cats will endure!');
        } else {
            this.emit(':tell', '{person with the most votes}, you have been found wanted. It is to be death by yarn strangulation! Unfortunately, we can’t know if that was the right decision. No turning back now.');
            this.emit(':tell', 'Night has fallen.');
        }
    },
    'endNightIntent': function () {
        endNight();
        this.emit(':tell', 'Here comes the sun!');
    },
    'AMAZON.YesIntent': function () {
        var speechOutput = "You said it buddy.";
        var reprompt = "What can I help you with?";
        this.emit(':ask', speechOutput, reprompt);
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', 'You are now leaving Catsville!');
    },
    'AMAZON.NoIntent': function () {
        var speechOutput = "NO NO NO NO NO NO NO";
        var reprompt = "What can I help you with?";
        this.emit(':ask', speechOutput, reprompt);
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = "NO ONE CAN HEAR YOUR MEOW";
        var reprompt = "What can I help you with?";
        this.emit(':ask', speechOutput, reprompt);
    }
}

/*******************************************************
* Twilio Integration
********************************************************/
function getTwilioJSON(lowerTimeBound, upperTimeBound, gameContext) {
    var gameContainer = [];
    var twilioJSON = client.messages.list({to: fromNumber}, function(err, data) {
        data.messages.forEach(function(message) {
            var messageTime = Date.parse(message.dateSent);
            if (messageTime > lowerTimeBound && messageTime < upperTimeBound) {
            switch (gameContext) {
                case "Action":
                    gameContainer.push({playerAction: message.body, phoneNumber: message.from});
                    break;

                case "Vote":
                    var voteName = sanitizeNames(message.body);
                    gameContainer.push({name: voteName});
                    break;

                case "Start":
                    var startName = sanitizeNames(message.body);
                    gameContainer.push({name: startName, phoneNumber: message.from});
                    break;

                default:
                    break; // return empty gameContainer on unknown gameContext
                }
            }
        });
    });
    return gameContainer;
}


function sendTwilioText(playerNumber, message) {
    client.messages.create({
    to: playerNumber,
    from: fromNumber,
    body: message,
    }, function(err, message) {
        console.log(message.sid);
    });
}

// Formats names to be predictable in app
function sanitizeNames(name) {
    // trim leading and trailing whitespace
    name = name.trim();
    name = name.replace(/\s+/g, ' ');

    // if they send first and last name jus use first name
    if (name.indexOf(' ') > -1) {
        name = name.split(' ')[0];
    }

    name = name.replace(/[^a-zA-Z]+/g, "");

    return name.toLowerCase();
}

// get all the players that reginstered in the registration time window
function getPlayersFromTwilio() {
    var startWindow = config.history.askForNumberStart;
    var endWindow = config.history.askForNumberEnd;

    // idk how to process these...
    return getTwilioJSON(startWindow, endWindow, "Start");


    /*
    players = [
        {
            name: name,
            phoneNumber: phoneNumber

        },
        {
            name: name,
            phoneNumber: phoneNumber

        }
    ]
*/
}

function getPlayerVotesFromTwilio() {
    var votes = [];
    var startWindow = config.history.nightActionStart;
    var endWindow = config.history.nightActionStart;

   return getTwilioJSON(startWindow, endWindow, "Action");



    /*
    votes = [
        {
            name: name,
        }

    ]
    */

}

function getPlayerActionsFromTwilio(startWindow, endWindow) {
    return getTwilioJSON(startWindow, endWindow, "Action");

    /*
    playerActions = [
        {
            phoneNumber: phoneNumber,
            playerAction: playerAction

        },
        {
            phoneNumber: phoneNumber,
            playerAction: playerAction
        },

    ]
*/

}

function getAlexaPhoneNumber() {
    return "6 3 1 7 5 9 8 3 5 5";
}