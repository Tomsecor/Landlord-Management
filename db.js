const { MongoClient } = require('mongodb');
require('dotenv').config();

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error('MONGO_URI is not defined in environment variables');
}

let dbInstance = null;

async function connectToDb() {
    if (dbInstance) return dbInstance;
    
    try {
        console.log('Connecting to MongoDB...');
        const client = await MongoClient.connect(mongoUri);
        dbInstance = client.db('your_db_name');
        console.log('Connected to MongoDB successfully');
        return dbInstance;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

function getDb() {
    if (!dbInstance) {
        throw new Error('Database not initialized. Call connectToDb() first.');
    }
    return dbInstance;
}

module.exports = { connectToDb, getDb };