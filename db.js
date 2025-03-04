const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI; // Access the connection string from Replit secrets
const client = new MongoClient(uri);

let db;

async function connect() {
  try {
    await client.connect();
    db = client.db('landlord'); // Use your database name here (e.g., 'landlord')
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not connected');
  }
  return db;
}

module.exports = { connect, getDb };