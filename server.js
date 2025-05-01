// Run the following command to install required dependencies:
// npm install express mongoose bcryptjs jsonwebtoken socket.io cors

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const socketio = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/learncom', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// User Schema
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePic: String,
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    courses: [String],
    bio: String,
    joinDate: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Message Schema
const MessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }
});

const Message = mongoose.model('Message', MessageSchema);

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.sendStatus(401);
    
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Routes
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const user = new User({
            username,
            email,
            password: hashedPassword
        });
        
        await user.save();
        
        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user) return res.status(400).json({ error: 'User not found' });
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });
        
        // Create JWT token
        const accessToken = jwt.sign(
            { userId: user._id, username: user.username },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: '1h' }
        );
        
        res.json({ accessToken, user: { username: user.username } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/user/:username', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username })
            .select('-password')
            .populate('friends', 'username profilePic');
            
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { receiver, text } = req.body;
        
        const sender = await User.findOne({ username: req.user.username });
        const receiverUser = await User.findOne({ username: receiver });
        
        if (!sender || !receiverUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const message = new Message({
            sender: sender._id,
            receiver: receiverUser._id,
            text
        });
        
        await message.save();
        
        // Emit the message to the receiver if they're online
        io.to(receiverUser._id.toString()).emit('newMessage', {
            sender: sender.username,
            text,
            timestamp: message.timestamp
        });
        
        res.status(201).json(message);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/messages/:friend', authenticateToken, async (req, res) => {
    try {
        const sender = await User.findOne({ username: req.user.username });
        const friend = await User.findOne({ username: req.params.friend });
        
        if (!sender || !friend) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const messages = await Message.find({
            $or: [
                { sender: sender._id, receiver: friend._id },
                { sender: friend._id, receiver: sender._id }
            ]
        }).sort('timestamp').populate('sender receiver', 'username');
        
        res.json(messages);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Socket.io setup
const io = socketio(server, {
    cors: {
        origin: "http://localhost:8080",
        methods: ["GET", "POST"]
    }
});

const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('New client connected');
    
    socket.on('registerUser', (userId) => {
        onlineUsers.set(userId, socket.id);
        console.log(`User ${userId} connected with socket ID ${socket.id}`);
    });
    
    socket.on('disconnect', () => {
        for (let [userId, socketId] of onlineUsers.entries()) {
            if (socketId === socket.id) {
                onlineUsers.delete(userId);
                console.log(`User ${userId} disconnected`);
                break;
            }
        }
    });
});
