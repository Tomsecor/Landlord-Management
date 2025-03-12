const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const router = express.Router();

// Get all todos
router.get('/', async (req, res) => {
    try {
        const db = getDb();
        const todos = await db.collection('todos').find({}).toArray();
        res.json(todos);
    } catch (error) {
        console.error('Error fetching todos:', error);
        res.status(500).json({ error: 'Failed to fetch todos' });
    }
});

// Get single todo
router.get('/:id', async (req, res) => {
    try {
        const db = getDb();
        const todo = await db.collection('todos').findOne({ _id: new ObjectId(req.params.id) });
        
        if (!todo) {
            return res.status(404).json({ error: 'Todo not found' });
        }
        
        res.json(todo);
    } catch (error) {
        console.error('Error fetching todo:', error);
        res.status(500).json({ error: 'Failed to fetch todo' });
    }
});

// Create new todo
router.post('/', async (req, res) => {
    try {
        const db = getDb();
        const todo = {
            ...req.body,
            created_at: new Date()
        };

        const result = await db.collection('todos').insertOne(todo);
        res.status(201).json({ 
            success: true, 
            _id: result.insertedId 
        });
    } catch (error) {
        console.error('Error creating todo:', error);
        res.status(500).json({ error: 'Failed to create todo' });
    }
});

// Update todo
router.put('/:id', async (req, res) => {
    try {
        const db = getDb();
        const updateData = {
            ...req.body,
            updated_at: new Date()
        };

        const result = await db.collection('todos').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Todo not found' });
        }

        res.json({ success: true, modified: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating todo:', error);
        res.status(500).json({ error: 'Failed to update todo' });
    }
});

// Delete todo
router.delete('/:id', async (req, res) => {
    try {
        const db = getDb();
        const result = await db.collection('todos').deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Todo not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting todo:', error);
        res.status(500).json({ error: 'Failed to delete todo' });
    }
});

module.exports = router;
