const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { connectToDb } = require('./db');
require('dotenv').config();
const path = require('path');

// Initialize express
const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        dbName: 'your_db_name', // Add this line to specify database name
        collectionName: 'sessions',    // Add this line to specify collection name
        ttl: 24 * 60 * 60,
        autoRemove: 'native'          // Add this for better session cleanup
    })
}));

// Serve static files for login and register without auth
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Import routes
const authRoutes = require('./routes/auth');
const billRoutes = require('./routes/bills');
const mileageRoutes = require('./routes/mileage');
const paymentRoutes = require('./routes/payments');
const propertyRoutes = require('./routes/properties');
const statisticsRoutes = require('./routes/statistics');
const tenantRoutes = require('./routes/tenants');
const todoRoutes = require('./routes/todos');

// Import auth middleware
const { requireAuth } = require('./middleware/auth');

// Apply auth middleware to all routes except login and register
app.use((req, res, next) => {
    if (req.path === '/login.html' || req.path === '/register.html' || req.path === '/api/auth/login' || req.path === '/api/auth/register') {
        return next();
    }
    requireAuth(req, res, next);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/bills', billRoutes);
app.use('/api/mileage', mileageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/todos', todoRoutes);

// Error handler for API routes
app.use('/api', (err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        res.status(401).json({ error: 'Unauthorized', redirect: '/login.html' });
    } else {
        next(err);
    }
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
    try {
        await connectToDb();
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;




