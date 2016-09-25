'use strict';

/*******************************************************
* Intialize App
********************************************************/

var Alexa = require('alexa-sdk');

//OPTIONAL: replace with "amzn1.echo-sdk-ams.app.[your-unique-value-here]";
var APP_ID = undefined; 
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

var config = {
    characterNames: {VILLAGER: 'villager', VILLAIN: 'werewolf', DOCTOR: 'doctor'}
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
    // pause // TODO: How do we handle app state stuff?
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
    config.history.rounds.append(roundHistory);

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

    config.players.append(newPlayer);
}

// Assign Characters once all players have been added
// Call only once per game
function setCharacters() {
    if (config.charactersAssigned == true) {
        // TODO: Handle Error
        return;
    }

    var allCharacters = config.allCharacters // getCharacterConfig(int numberOfCharacters)
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
    config.protectedPlayerNames.append(playerName);
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
        
        actions.append(actionObj);
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

    for (player in config.players) {
        if (player[prop] == value) {
            result = player;
        }
    }

    // TODO: Error handling for no player object found
    return player;
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

/*******************************************************
* Alexa Speaks
********************************************************/

function sayIntro() {
    console.log('sayIntro');
}
function sayInstructions() {
    console.log('sayInstructions');
}
function sayCharacterRoles() {
    console.log('sayCharacterRoles');
}
function sayDayDeath() {
    console.log('sayDayDeath');
}
function sayNightDeath() {
    console.log('sayNightDeath');
}
function sayOutro() {
    console.log('sayOutro');
}
function sayStartDeliberation() {
    console.log('sayStartDeliberation');
}
function sayEndDeliberation() {
    console.log('sayEndDeliberation');
}
function sayNightStart() {
    console.log('sayNightStart');
}
function sayNightEnd() {
    console.log('sayNightEnd');
}
/*******************************************************
* Intent Mappping
********************************************************/


var handlers = {
    'LaunchRequest': function () {
        this.emit('StartGame');
    },
    'GetTwilioTextIntent': function(payload) {
        var textMessage = payload.content;
        var playerPhoneNumber = payload.from;

        var currentPhase = getCurrentPhase();

        if (currentPhase == 'getNames') {
            var totalCount = addNewName(textMessage, playerPhoneNumber);
            this.emit(':tell', "There are " + totalCount + " Players");
        } else if (currentPhase == 'getActions') {
            addNewAction(textMessage, playerPhoneNumber);
        }
    },
    'GetAllPlayersReadyIntent': function() {
        // send out character roles
        // TWILIO STUFF
        var charCount = getCharacterCount();

        // gets teh list of characters for this number of players
        var characters = getCharacterList(charCount);
        var players = getPlayerNumberList();

        var shuffledCharacters = shuffle(characters);
        var shuffledPlayers = shuffle(players);

        for (var i = 0; i < shuffledCharacters.length; i++) {
            var selectedCharacter = shuffledCharacters[i];
            var selectedPlayer = shuffledPlayer[i];

            // addCharacter
            addCharacter(selectedPlayer, selectedCharacter);
            textCharacter(selectedPlayer, getCharacterText(selectedCharacter));
        }

        


    },
    'AllCharactersAssignedIntent': function() {


    }
    'startGame': function() {
        var getNumber = StartGame.getNumber();

        var welcomeMessage = "Welcome to Catskill! The game where you try to kill your friends... with Cats!"
        var sceneSetUp = "A small village outisde mountains. A peaceful town. A town made of cats.";
        var number = getTwilioPhoneNumber();

        var testInstructions = "Text your name to the following number" + number;

        var fullStartMessage = welcomeMessage + sceneSetUp + testInstructions;

        this.emit(':tell', fullStartMessage);
    },
    'AMAZON.HelpIntent': function () {
        var speechOutput = "You can say tell me a space fact, or, you can say exit... What can I help you with?";
        var reprompt = "What can I help you with?";
        this.emit(':ask', speechOutput, reprompt);
    },
    'AMAZON.CancelIntent': function () {
        this.emit(':tell', 'Goodbye!');
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', 'Goodbye!');
    }
};

/*******************************************************
* Twilio Integration
********************************************************/

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
    var messages = getMessagesFromTwilio(startWindow, endWindow);

    var players;

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
    return players;
}

function getPlayerVotesFromTwilio() {
    var votes = [];
    var startWindow = config.history.nightActionStart;
    var endWindow = config.history.nightActionStart;

    // idk how to process these...
    var messages = getMessagesFromTwilio(startWindow, endWindow);


    /*
    votes = [
        {
            name: name,
        },
        {
            name: name,
        },

    ]
    */

    return votes;
}

function getPlayerActionsFromTwilio() {
    var playerActions = [];
    var startWindow = config.history.dayKillVoteStart;
    var endWindow = config.history.dayKillVoteEnd;

    // idk how to process these...
    var messages = getMessagesFromTwilio(startWindow, endWindow);

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

    return playerActions;
}
