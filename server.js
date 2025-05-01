const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let users = {}; // Store user sessions and connections
let chatMessages = {}; // Store chat messages

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'login':
                handleLogin(ws, data);
                break;
            case 'sendMessage':
                handleSendMessage(data);
                break;
            case 'syncMessages':
                handleSyncMessages(ws, data);
                break;
        }
    });

    ws.on('close', () => {
        handleDisconnect(ws);
    });
});

function handleLogin(ws, data) {
    const { username } = data;
    if (!users[username]) {
        users[username] = [];
    }
    users[username].push(ws);
    ws.username = username;

    // Send existing messages to the user
    ws.send(JSON.stringify({
        type: 'syncMessages',
        messages: chatMessages[username] || {}
    }));
}

function handleSendMessage(data) {
    const { sender, recipient, text, timestamp } = data;

    if (!chatMessages[sender]) chatMessages[sender] = {};
    if (!chatMessages[sender][recipient]) chatMessages[sender][recipient] = [];
    chatMessages[sender][recipient].push({ sender, text, timestamp });

    if (!chatMessages[recipient]) chatMessages[recipient] = {};
    if (!chatMessages[recipient][sender]) chatMessages[recipient][sender] = [];
    chatMessages[recipient][sender].push({ sender, text, timestamp });

    // Notify recipient devices
    if (users[recipient]) {
        users[recipient].forEach((client) => {
            client.send(JSON.stringify({
                type: 'newMessage',
                sender,
                text,
                timestamp
            }));
        });
    }
}

function handleSyncMessages(ws, data) {
    const { username } = data;
    ws.send(JSON.stringify({
        type: 'syncMessages',
        messages: chatMessages[username] || {}
    }));
}

function handleDisconnect(ws) {
    if (ws.username && users[ws.username]) {
        users[ws.username] = users[ws.username].filter((client) => client !== ws);
        if (users[ws.username].length === 0) {
            delete users[ws.username];
        }
    }
}

server.listen(8080, () => {
    console.log('Server is running on http://localhost:8080');
});
