const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const router = express.Router();

// Get all bills
router.get('/', async (req, res) => {
    try {
        const db = getDb();
        
        // Get all bills and populate with property info
        const bills = await db.collection('bills').find({}).toArray();
        
        // Enhance bills with property info
        const enhancedBills = await Promise.all(bills.map(async (bill) => {
            try {
                // Convert string property_id to ObjectId if needed
                const propertyId = typeof bill.property_id === 'string' 
                    ? new ObjectId(bill.property_id) 
                    : bill.property_id;

                const property = await db.collection('properties').findOne({ 
                    _id: propertyId 
                });

                return {
                    ...bill,
                    property_id: propertyId,
                    property_info: property ? {
                        address: property.address,
                        city: property.city
                    } : null
                };
            } catch (err) {
                console.error('Error processing bill:', err);
                return bill;
            }
        }));

        res.json(enhancedBills);
    } catch (error) {
        console.error('Error fetching bills:', error);
        res.status(500).json({ error: 'Failed to fetch bills' });
    }
});

// Get single bill
router.get('/:id', async (req, res) => {
    try {
        const db = getDb();
        const bill = await db.collection('bills').findOne({ _id: new ObjectId(req.params.id) });
        
        if (!bill) {
            return res.status(404).json({ error: 'Bill not found' });
        }
        
        res.json(bill);
    } catch (error) {
        console.error('Error fetching bill:', error);
        res.status(500).json({ error: 'Failed to fetch bill' });
    }
});

// Create new bill
router.post('/', async (req, res) => {
    try {
        const db = getDb();
        const bill = {
            ...req.body,
            property_id: new ObjectId(req.body.property_id), // Ensure ObjectId conversion
            due_date: new Date(req.body.due_date),
            amount: parseFloat(req.body.amount),
            created_at: new Date()
        };

        const result = await db.collection('bills').insertOne(bill);
        res.status(201).json({ 
            success: true, 
            _id: result.insertedId 
        });
    } catch (error) {
        console.error('Error creating bill:', error);
        res.status(500).json({ error: 'Failed to create bill' });
    }
});

// Update bill
router.put('/:id', async (req, res) => {
    try {
        const db = getDb();
        // Remove _id from update data to prevent MongoDB errors
        const { _id, ...updateData } = req.body;
        
        // Convert property_id if it exists in the update data
        if (updateData.property_id) {
            updateData.property_id = new ObjectId(updateData.property_id);
        }

        // Convert dates and numbers
        if (updateData.due_date) updateData.due_date = new Date(updateData.due_date);
        if (updateData.payment_date) updateData.payment_date = new Date(updateData.payment_date);
        if ('amount' in updateData) updateData.amount = parseFloat(updateData.amount);
        
        // Add updated timestamp
        updateData.updated_at = new Date();

        const result = await db.collection('bills').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }

        res.json({ success: true, modified: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating bill:', error);
        res.status(500).json({ error: 'Failed to update bill' });
    }
});

// Delete bill
router.delete('/:id', async (req, res) => {
    try {
        const db = getDb();
        const result = await db.collection('bills').deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Bill not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting bill:', error);
        res.status(500).json({ error: 'Failed to delete bill' });
    }
});

// Create monthly instance for recurring bills
router.post('/create-monthly-instance', async (req, res) => {
    try {
        const db = getDb();
        const { bill_id } = req.body;

        // Get the original bill
        const originalBill = await db.collection('bills').findOne({ _id: new ObjectId(bill_id) });
        if (!originalBill) {
            return res.status(404).json({ error: 'Original bill not found' });
        }

        // Create new instance for next month
        const nextMonth = new Date(originalBill.due_date);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        const newBill = {
            ...originalBill,
            _id: new ObjectId(),
            due_date: nextMonth,
            paid: false,
            payment_date: null,
            created_at: new Date()
        };

        const result = await db.collection('bills').insertOne(newBill);
        res.status(201).json({ 
            success: true, 
            _id: result.insertedId 
        });
    } catch (error) {
        console.error('Error creating monthly bill instance:', error);
        res.status(500).json({ error: 'Failed to create monthly bill instance' });
    }
});

// Add any missing bill-related routes
router.get('/property/:property_id', async (req, res) => {
    try {
        const db = getDb();
        const bills = await db.collection('bills')
            .find({ property_id: req.params.property_id })
            .toArray();
        res.json(bills);
    } catch (error) {
        console.error('Error fetching property bills:', error);
        res.status(500).json({ error: 'Failed to fetch property bills' });
    }
});

// Download bills report
router.get('/download-report', async (req, res) => {
    try {
        const db = getDb();
        const bills = await db.collection('bills').find({}).toArray();
        
        const csvData = bills.map(bill => ({
            property: bill.property_id,
            type: bill.bill_type,
            amount: bill.amount,
            due_date: new Date(bill.due_date).toLocaleDateString(),
            status: bill.paid ? 'Paid' : 'Unpaid',
            payment_date: bill.payment_date ? new Date(bill.payment_date).toLocaleDateString() : '',
            notes: bill.notes || ''
        }));

        res.json({
            success: true,
            data: csvData
        });
    } catch (error) {
        console.error('Error generating bills report:', error);
        res.status(500).json({ error: 'Failed to generate bills report' });
    }
});

module.exports = router;
