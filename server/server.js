const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectDB = require('./config/db');
const pipelineOrchestrator = require('./services/pipelineOrchestrator');
const scraperService = require('./services/scraperService');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const app = express();
const server = http.createServer(app);

// Socket.IO with CORS
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Connect Socket.IO to pipeline orchestrator
pipelineOrchestrator.setSocketIO(io);

// Routes
app.use('/api/scrapers', require('./routes/scraperRoutes'));
app.use('/api/extensions', require('./routes/extensionRoutes'));
app.use('/api', require('./routes/extensionRoutes')); // /api/jobs/batch for Chrome extensions
app.use('/api/workflow', require('./routes/workflowRoutes'));
app.use('/api/logs', require('./routes/logRoutes'));
app.use('/api/sheets', require('./routes/sheetRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/superadmin', require('./routes/superadminRoutes'));


// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current workflow status on connect
    const status = pipelineOrchestrator.getWorkflowStatus();
    if (status) {
        socket.emit('workflow:progress', status);
    }

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Start server
const PORT = process.env.PORT || 5002;

async function start() {
    await connectDB();
    await scraperService.initializeScraperStates();

    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
