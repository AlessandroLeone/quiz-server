const { v4: uuidv4 } = require('uuid');
var random = require('random-name')

function generateBotPlayer(_trophy) {
    const name = `${random.first()}_${random.last()}`;
    const code = Math.random().toString(36).substring(7);
    const email = name + '@spaceos.it';
    const trophy = _trophy + (Math.floor(Math.random() * 200) * (Math.random() < 0.5 ? -1 : 1));

    const botPlayer = {
        prop: {
            id: uuidv4().toString(),
            uid: uuidv4().toString(),
            email: email,
            photo: 'https://ui-avatars.com/api/?name=' + email + '&background=8943ff&color=fff',
            trophy: trophy,
            code: code,
            bot: true,
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
    };

    return botPlayer;
}

module.exports = generateBotPlayer;