const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const router = express.Router();

// Get all payments
router.get('/', async (req, res) => {
    try {
        const db = getDb();
        const paymentsCollection = db.collection('payments');
        const tenantsCollection = db.collection('tenants');
        const propertiesCollection = db.collection('properties');
        
        // Get property filter if provided
        const propertyId = req.query.property_id;
        const query = propertyId ? { property_id: new ObjectId(propertyId) } : {};

        // Get all payments (filtered by property if requested)
        const payments = await paymentsCollection.find(query).toArray();

        // Enhance payments with property info
        const enhancedPayments = await Promise.all(payments.map(async (payment) => {
            let propertyInfo = null;
            if (payment.property_id) {
                propertyInfo = await propertiesCollection.findOne({ _id: payment.property_id });
            }

            return {
                ...payment,
                propertyInfo: propertyInfo ? {
                    address: propertyInfo.address,
                    city: propertyInfo.city
                } : null
            };
        }));

        res.json(enhancedPayments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// Get single payment with enhanced data
router.get('/:id', async (req, res) => {
    try {
        const db = getDb();
        const payment = await db.collection('payments').findOne({ 
            _id: new ObjectId(req.params.id) 
        });
        
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        // Enhance with tenant and property info if IDs exist
        if (payment.tenant_id) {
            const tenant = await db.collection('tenants')
                .findOne({ _id: new ObjectId(payment.tenant_id) });
            payment.tenant_name = tenant ? tenant.name : 'Unknown';
        }

        if (payment.property_id) {
            const property = await db.collection('properties')
                .findOne({ _id: new ObjectId(payment.property_id) });
            payment.property_address = property ? property.address : 'Unknown';
        }

        res.json(payment);
    } catch (error) {
        console.error('Error fetching payment:', error);
        res.status(500).json({ error: 'Failed to fetch payment' });
    }
});

// Get payments by tenant
router.get('/tenant/:tenant_id', async (req, res) => {
    try {
        const db = getDb();
        const payments = await db.collection('payments')
            .find({ tenant_id: req.params.tenant_id })
            .sort({ payment_date: -1 })
            .toArray();
        res.json(payments);
    } catch (error) {
        console.error('Error fetching tenant payments:', error);
        res.status(500).json({ error: 'Failed to fetch tenant payments' });
    }
});

// Get payments by property
router.get('/property/:property_id', async (req, res) => {
    try {
        const db = getDb();
        const payments = await db.collection('payments')
            .find({ property_id: req.params.property_id })
            .sort({ payment_date: -1 })
            .toArray();
        res.json(payments);
    } catch (error) {
        console.error('Error fetching property payments:', error);
        res.status(500).json({ error: 'Failed to fetch property payments' });
    }
});

// Update payment
router.put('/:id', async (req, res) => {
    try {
        const db = getDb();
        const updateData = {
            ...req.body,
            updated_at: new Date()
        };

        const result = await db.collection('payments').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        res.json({ success: true, modified: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating payment:', error);
        res.status(500).json({ error: 'Failed to update payment' });
    }
});

// Delete payment
router.delete('/:id', async (req, res) => {
    try {
        const db = getDb();
        const result = await db.collection('payments').deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting payment:', error);
        res.status(500).json({ error: 'Failed to delete payment' });
    }
});

// Create new payment (Replace app.post with router.post)
router.post('/', async (req, res) => {
    try {
        const db = getDb();
        const paymentsCollection = db.collection('payments');
        const tenantsCollection = db.collection('tenants');

        // Find tenant to get property_id
        const tenant = await tenantsCollection.findOne({ name: req.body.tenant_name });
        if (!tenant) {
            return res.status(400).json({ error: 'Selected tenant does not exist' });
        }

        const payment = {
            tenant_name: req.body.tenant_name,
            tenant_id: tenant._id,
            property_id: tenant.property_id,
            payment_date: new Date(req.body.payment_date),
            amount: parseFloat(req.body.amount) || tenant.monthly_rent || 0,
            payment_type: req.body.payment_type || 'Rent',
            payment_method: req.body.payment_method || 'Cash',
            paid: req.body.paid === 'on',
            notes: req.body.notes || '',
            created_at: new Date()
        };

        const result = await paymentsCollection.insertOne(payment);
        res.status(201).json({ 
            success: true, 
            _id: result.insertedId 
        });
    } catch (error) {
        console.error('Error adding payment:', error);
        res.status(500).json({ error: 'Failed to add payment' });
    }
});

module.exports = router;
