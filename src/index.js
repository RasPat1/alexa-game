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

//OPTIONAL: replace with "amzn1.echo-sdk-ams.app.[your-unique-value-here]";
var APP_ID = "amzn1.echo-sdk-ams.app.78c5e44b-3bb9-4710-a59d-cb8a34d32793"; 
var SKILL_NAME = 'Catskill';

exports.handler = function(event, context, callback) {
    var alexa = Alexa.handler(event, context);
    alexa.appId = APP_ID;
    alexa.registerHandlers(handlers);
    alexa.execute();
};

/*******************************************************
* Game State
********************************************************/

var characterNames = {VILLAGER: 'villager', VILLAIN: 'werewolf', DOCTOR: 'doctor'};

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
    nightDeathCharacter: null, // updated everynight if someon died
    state: {
        roundNumber: 0,
        charactersAssigned: false,
        gameOver: false,
        villainWin: false,
        heroWin: false
    },
    history: {
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
    } // history of the game
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

function mainGame() {
    sayIntro();
    sayInstructions();
    config.history.askForNumberStart = Date.now();

    // pause // wait 30 seconds // Or get intent to continue
    // Alexa Pause
    config.history.askForNumberEnd = Date.now();
    var players = getPlayersFromTwilio();

    for (player in players) {
        addPlayer(player.name, player.phoneNumber);
    }

    setCharacters();

    while (!config.state.gameOver) {
        playRound();
    }

    sayOutro();
}

function playRound() {
    var roundHistory = {};
    var actions = [];
    var votes = [];
    config.protectedPlayers = []; // Clear protectedPlayers at start of each round
    config.roundNumber = config.roundNumber++;

    sayNightDeath(config.nightDeathCharacter);
    sayStartDeliberation();
    // Pause for a bit
    sayEndDeliberation();

    roundHistory.dayKillVoteStart = Date.now();
    // Pause. ToDo: Need way of making async behavior synchronous
    roundHistory.dayKillVoteEnd = Date.now();

    votes = getPlayerVotesFromTwilio(roundHistory.dayKillVoteStart, roundHistory.dayKillVoteEnd);
    var deadPlayerName = resolveVotes(votes);
    resolveDeath(deadPlayerName);

    sayDayDeath(deadPlayerName);

    evaluateEndCondition();

    if (config.state.gameOver) {
        return;
    }
 
    roundHistory.nightActionStart = Date.now();
    sayNightStart();
    // pause ToDo: Need way of making async behavior synchronous
    sayNightEnd();
    roundHistory.nightActionEnd = Date.now();
    config.history.rounds.push(roundHistory);

    actions = getPlayerActionsFromTwilio(roundHistory.nightActionStart, roundHistory.nightActionEnd);
    resolvePlayerActions(actions);
    evaluateEndCondition();
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
    if (config.charactersAssigned == true) {
        // TODO: Handle Error
        return;
    }

    var allCharacters = config.allCharacters // getCharacterConfig(var numberOfCharacters)
    var shuffledCharacters = shuffle(allCharacters);

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

// Determine if game is over (more Werewolver)
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

function sayIntro() {
    var speechOutput = "asdf";
    this.emit(':tell', speechOutput);
}
function sayInstructions() {
    console.log('sayInstructions');
    this.emit(':tell', 'sayInstructions');
}
function sayCharacterRoles() {
    console.log('sayCharacterRoles');
    this.emit(':tell', 'sayCharacterRoles');
}
function sayDayDeath() {
    console.log('sayDayDeath');
    this.emit(':tell', 'sayDayDeath');
}
function sayNightDeath() {
    console.log('sayNightDeath');
    this.emit(':tell', 'sayNightDeath');
}
function sayOutro() {
    console.log('sayOutro');
    this.emit(':tell', 'sayOutro');
}
function sayStartDeliberation() {
    console.log('sayStartDeliberation');
    this.emit(':tell', 'sayStartDeliberation');
}
function sayEndDeliberation() {
    console.log('sayEndDeliberation');
    this.emit(':tell', 'sayEndDeliberation');
}
function sayNightStart() {
    console.log('sayNightStart');
    this.emit(':tell', 'sayNightStart');
}
function sayNightEnd() {
    console.log('sayNightEnd');
    this.emit(':tell', 'sayNightEnd');
}
/*******************************************************
* Intent Mappping
********************************************************/


var handlers = {
    'LaunchRequest': function () {
        this.emit('StartGame');
    },
    'AMAZON.YES': function () {
        var speechOutput = "You said it buddy.";
        var reprompt = "What can I help you with?";
    },
    'AMAZON.NO': function () {
        var speechOutput = "NO NO NO NO NO NO NO";
        var reprompt = "What can I help you with?";
        this.emit(':ask', speechOutput, reprompt);
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = "NO ONE CAN HEAR YOUR MEOW";
        var reprompt = "What can I help you with?";
        this.emit(':ask', speechOutput, reprompt);
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', 'Goodbye!');
    }
};

/*******************************************************
* Twilio Integration
********************************************************/
function getTwilioJSON(lowerTimeBound, upperTimeBound, gameContext){
    var gameContainer = [];
    var twilioJSON = client.messages.list({to: fromNumber}, function(err, data) {
        data.messages.forEach(function(message) {
            var messageTime = Date.parse(message.dateSent);
            if ( messageTime > lowerTimeBound && messageTime < upperTimeBound ){
            switch (gameContext){
                case "Action":
                    gameContainer.push({playerAction: message.body, phoneNumber: message.from});
                    break;
                
                case "Vote":
                    gameContainer.push({name: message.body});
                    break;    
                
                case "Start":
                    gameContainer.push({name: message.body, phoneNumber: message.from});
                    break;    
                    
                }
            }
        });
    });   
    return gameContainer;
}


function sendTwilioText(playerNumber, message){
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

        },

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

function getPlayerActionsFromTwilio() {
    var playerActions = [];
    var startWindow = config.history.dayKillVoteStart;
    var endWindow = config.history.dayKillVoteEnd;

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


/*******************************************************
* Run Main game
********************************************************/

mainGame();
