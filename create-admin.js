const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function createAdminUser() {
    const client = new MongoClient(process.env.MONGO_URI);
    
    try {
        await client.connect();
        const db = client.db("your_db_name"); // Use your actual database name
        
        // Hash the password
        const password = "admin123"; // Change this to your desired password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create admin user
        const user = {
            email: "admin@example.com", // Change this to your email
            password: hashedPassword,
            name: "Admin User",
            created_at: new Date()
        };
        
        // Insert user into database
        const result = await db.collection('users').insertOne(user);
        console.log('Admin user created successfully');
        console.log('Email:', user.email);
        console.log('Password:', password);
        
    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        await client.close();
    }
}

createAdminUser();
