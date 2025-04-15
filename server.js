const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            'http://localhost:3000',
            'https://your-app-name.onrender.com', // Replace with your Render URL
            'https://your-custom-domain.com'      // Add your domain (optional)
        ],
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 20000, // Increase timeout for mobile users
    pingInterval: 25000
});

// Serve static files (index.html)
app.use(express.static(__dirname));

// Serve index.html for both / and /index.html
app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Optional: API endpoint for future monetization (e.g., premium status)
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', users: io.engine.clientsCount });
});

// Store waiting users
let waitingUsers = [];
// Store paired users
let pairs = new Map();

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Pair user
    if (waitingUsers.length > 0) {
        const partner = waitingUsers.shift();
        pairs.set(socket.id, partner.id);
        pairs.set(partner.id, socket.id);

        socket.emit('paired');
        partner.emit('paired');
    } else {
        waitingUsers.push(socket);
    }

    // Handle messages
    socket.on('message', (msg) => {
        const partnerId = pairs.get(socket.id);
        if (partnerId) {
            io.to(partnerId).emit('message', msg);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const partnerId = pairs.get(socket.id);

        if (partnerId) {
            io.to(partnerId).emit('strangerDisconnected');
            pairs.delete(partnerId);
            pairs.delete(socket.id);
            const partnerSocket = io.sockets.sockets.get(partnerId);
            if (partnerSocket) {
                waitingUsers.push(partnerSocket);
            }
        } else {
            waitingUsers = waitingUsers.filter((s) => s.id !== socket.id);
        }
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down...');
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});