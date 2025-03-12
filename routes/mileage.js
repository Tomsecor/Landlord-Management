const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const router = express.Router();

// Get all mileage entries
router.get('/', async (req, res) => {
    try {
        const db = getDb();
        const mileage = await db.collection('mileage')
            .find({})
            .sort({ date: -1 })
            .toArray();

        // Enhance with property info
        const enhancedMileage = await Promise.all(mileage.map(async (entry) => {
            if (entry.property_id) {
                const property = await db.collection('properties')
                    .findOne({ _id: new ObjectId(entry.property_id) });
                return {
                    ...entry,
                    property_name: property ? property.address : 'Unknown'
                };
            }
            return entry;
        }));

        res.json(enhancedMileage);
    } catch (error) {
        console.error('Error fetching mileage:', error);
        res.status(500).json({ error: 'Failed to fetch mileage entries' });
    }
});

// Get single mileage entry
router.get('/:id', async (req, res) => {
    try {
        const db = getDb();
        const entry = await db.collection('mileage')
            .findOne({ _id: new ObjectId(req.params.id) });
        
        if (!entry) {
            return res.status(404).json({ error: 'Mileage entry not found' });
        }
        
        res.json(entry);
    } catch (error) {
        console.error('Error fetching mileage entry:', error);
        res.status(500).json({ error: 'Failed to fetch mileage entry' });
    }
});

// Create new mileage entry
router.post('/', async (req, res) => {
    try {
        const db = getDb();
        const entry = {
            ...req.body,
            date: new Date(req.body.date),
            created_at: new Date(),
            total_miles: parseFloat(req.body.total_miles),
            tax_deductible: req.body.tax_deductible === true
        };

        const result = await db.collection('mileage').insertOne(entry);
        res.status(201).json({ 
            success: true, 
            _id: result.insertedId 
        });
    } catch (error) {
        console.error('Error creating mileage entry:', error);
        res.status(500).json({ error: 'Failed to create mileage entry' });
    }
});

// Update mileage entry
router.put('/:id', async (req, res) => {
    try {
        const db = getDb();
        const updateData = {
            ...req.body,
            date: new Date(req.body.date),
            updated_at: new Date(),
            total_miles: parseFloat(req.body.total_miles),
            tax_deductible: req.body.tax_deductible === true
        };

        const result = await db.collection('mileage').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Mileage entry not found' });
        }

        res.json({ success: true, modified: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating mileage entry:', error);
        res.status(500).json({ error: 'Failed to update mileage entry' });
    }
});

// Delete mileage entry
router.delete('/:id', async (req, res) => {
    try {
        const db = getDb();
        const result = await db.collection('mileage')
            .deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Mileage entry not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting mileage entry:', error);
        res.status(500).json({ error: 'Failed to delete mileage entry' });
    }
});

module.exports = router;
