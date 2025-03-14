const bcrypt = require('bcryptjs');
const { getDb } = require('../db');

// Authentication middleware
function requireAuth(req, res, next) {
    // Public paths that don't need authentication
    const publicPaths = ['/login.html', '/register.html', '/styles', '/css', '/js'];
    const isPublicPath = publicPaths.some(path => req.path.startsWith(path));
    
    if (isPublicPath || req.path === '/') {
        return next();
    }

    if (req.session && req.session.userId) {
        return next();
    }
    
    // Handle API requests
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized', redirect: '/login.html' });
    }
    
    // Redirect any other requests to login
    res.redirect('/login.html');
}

// Login handler
async function login(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password required' });
        }

        const db = getDb();
        const user = await db.collection('users').findOne({ email });
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Set session data
        req.session.userId = user._id;
        req.session.email = user.email;
        
        res.json({ success: true, message: 'Logged in successfully' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

// Logout handler
function logout(req, res) {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Error logging out' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
}

// Register handler
async function register(req, res) {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password required' });
        }

        const db = getDb();
        const existingUser = await db.collection('users').findOne({ email });
        
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.collection('users').insertOne({
            email,
            password: hashedPassword,
            created_at: new Date()
        });

        res.json({ success: true, message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

module.exports = {
    requireAuth,
    login,
    logout,
    register
};
