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
    allCharacters: ['villager', 'werewolf', 'doctor'],
    characterActionExecutionOrder: ['villager', 'doctor', 'werewolf']
    characters: [
        {
            name: 'villager',
            nightAction: ['run', 'hide'],
            description: ['You are a villager! At night text how you want to to do! For example: \'Hide in the shed\''],
            isVillain: false
        },
        {   
            name: 'doctor',
            nightAction: ['save'],
            description: ['You are a Doctor! At night text the name of who you want to save.'],
            isVillain: false
        },
        {   
            name: 'werewolf',
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
                alive: true
            }
        */
    ],
    protectedPlayerNames: [],
    state: {
        charactersAssigned: false,
        gameOver: false,
        villainsWin: false
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
        alive: true
    };

    config.players.append(newPlayer);
}

// Assign Characters once all players have been added
// Call only once per game
function setCharacters() {
    if (config.charactersAssigned == true) {
        // TODO: Handle Error
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
        // player does not die
    } else {
        var playerObj = getPlayerInfo(name, 'name');
        playerObj.isAlive = false;
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
        if (player.alive) {
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
    config.state.herosWin = heroWin;
    config.state.gameOver = villainWin || heroWin;
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
    // pause
    var players = getPlayersFromTwilio();

    for (player in players) {
        addPlayer(player.content, player.phoneNumbers);
    }

    setCharacters();


    while (!config.state.gameOver) {
        playRound();
    }

    sayOutro();
}

function playRound() {
    config.protectedPlayers = []; // clear protectedPlayers at start of each round

    sayNightDeath();
    startDeliberation();
    openUpForTexts();
    // Pause. ToDo: Need way of making async behavior synchronous
    resolvePlayerActions();
    evaluateEndCondition();
}

function resolvePlayerActions() {
    var actions = getPlayerActions();

    sortByCharacterPriority(actions); // TODO check that the sort modifies the array

    for (action in actions) {
        executeAction(action);
    }
}

function getPlayerActions() {
    var actions = []
    var payloads = getTwilioPayloads()
    for (payload in payloads) {
        var playerNumber = payload.phoneNumber;
        var playerAction = payload.action;
        var playerInfo = getPlayerInfo(playerNumber, 'number');

        var actionObj = {
            playerName: playerInfo.name,
            character: playerInfo.character,
            characterAction
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

/*******************************************************
* Alexa Speaks
********************************************************/

function sayIntro() {}
function sayInstructions() {}
function sayCharacterRoles() {}
function sayDayDeath() {}
function sayNightDeath() {}
function sayOutro() {}

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