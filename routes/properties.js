const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const router = express.Router();

// Get all properties
router.get('/', async (req, res) => {
    try {
        const db = getDb();
        const properties = await db.collection('properties').find({}).toArray();
        res.json(properties);
    } catch (error) {
        console.error('Error fetching properties:', error);
        res.status(500).json({ error: 'Failed to fetch properties' });
    }
});

// Get property details with all related data
router.get('/:id', async (req, res) => {
    try {
        const db = getDb();
        const propertyId = new ObjectId(req.params.id);
        
        // Get property details
        const property = await db.collection('properties').findOne({ _id: propertyId });
        if (!property) {
            return res.status(404).json({ error: 'Property not found' });
        }

        // Get tenants for this property
        const tenants = await db.collection('tenants')
            .find({ property_id: propertyId })
            .toArray();

        // Get payments for this property
        const payments = await db.collection('payments')
            .find({ property_id: propertyId })
            .sort({ payment_date: -1 })
            .toArray();

        // Get bills for this property
        const bills = await db.collection('bills')
            .find({ property_id: propertyId })
            .sort({ due_date: -1 })
            .toArray();

        res.json({
            ...property,
            tenants,
            payments,
            bills
        });
    } catch (error) {
        console.error('Error fetching property:', error);
        res.status(500).json({ error: 'Failed to fetch property details' });
    }
});

// Get tenants for a specific property
router.get('/:id/tenants', async (req, res) => {
    try {
        const db = getDb();
        const propertyId = new ObjectId(req.params.id);
        
        const tenants = await db.collection('tenants')
            .find({ property_id: propertyId })
            .toArray();

        // Enhance with payment status
        const enhancedTenants = await Promise.all(tenants.map(async (tenant) => {
            const lastPayment = await db.collection('payments')
                .findOne(
                    { tenant_id: tenant._id, paid: true },
                    { sort: { payment_date: -1 } }
                );

            return {
                ...tenant,
                lastPaymentDate: lastPayment?.payment_date || null,
                lastPaymentMonth: lastPayment ? new Date(lastPayment.payment_date).getMonth() + 1 : null,
                lastPaymentYear: lastPayment ? new Date(lastPayment.payment_date).getFullYear() : null
            };
        }));

        res.json(enhancedTenants);
    } catch (error) {
        console.error('Error fetching property tenants:', error);
        res.status(500).json({ error: 'Failed to fetch tenants' });
    }
});

// Get payments for a specific property
router.get('/:id/payments', async (req, res) => {
    try {
        const db = getDb();
        const propertyId = new ObjectId(req.params.id);
        
        const payments = await db.collection('payments')
            .find({ property_id: propertyId })
            .sort({ payment_date: -1 })
            .toArray();

        // Enhance with tenant names
        const enhancedPayments = await Promise.all(payments.map(async (payment) => {
            if (payment.tenant_id) {
                const tenant = await db.collection('tenants')
                    .findOne({ _id: new ObjectId(payment.tenant_id) });
                payment.tenant_name = tenant ? tenant.name : 'Unknown';
            }
            return payment;
        }));

        res.json(enhancedPayments);
    } catch (error) {
        console.error('Error fetching property payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// Get bills for a specific property
router.get('/:id/bills', async (req, res) => {
    try {
        const db = getDb();
        const propertyId = new ObjectId(req.params.id);
        
        // First, let's check what we're querying with
        console.log('Querying bills with propertyId:', propertyId);

        // Find bills and ensure property_id is converted to ObjectId
        const bills = await db.collection('bills')
            .find({
                property_id: { 
                    $in: [
                        propertyId, // Handle if stored as ObjectId
                        req.params.id, // Handle if stored as string
                    ]
                }
            })
            .sort({ due_date: -1 })
            .toArray();

        // Log what we found for debugging
        console.log(`Found ${bills.length} bills for property ${req.params.id}`);

        // Convert any string property_ids to ObjectId
        const normalizedBills = bills.map(bill => ({
            ...bill,
            property_id: typeof bill.property_id === 'string' 
                ? new ObjectId(bill.property_id) 
                : bill.property_id
        }));

        res.json(normalizedBills);
    } catch (error) {
        console.error('Error fetching property bills:', error);
        res.status(500).json({ error: 'Failed to fetch bills' });
    }
});

// Create new property
router.post('/', async (req, res) => {
    try {
        const db = getDb();
        const property = {
            ...req.body,
            created_at: new Date()
        };

        const result = await db.collection('properties').insertOne(property);
        res.status(201).json({ 
            success: true, 
            _id: result.insertedId 
        });
    } catch (error) {
        console.error('Error creating property:', error);
        res.status(500).json({ error: 'Failed to create property' });
    }
});

// Update property
router.put('/:id', async (req, res) => {
    try {
        const db = getDb();
        const updateData = {
            ...req.body,
            updated_at: new Date()
        };

        const result = await db.collection('properties').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Property not found' });
        }

        res.json({ success: true, modified: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating property:', error);
        res.status(500).json({ error: 'Failed to update property' });
    }
});

// Delete property
router.delete('/:id', async (req, res) => {
    try {
        const db = getDb();
        const result = await db.collection('properties').deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Property not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting property:', error);
        res.status(500).json({ error: 'Failed to delete property' });
    }
});

module.exports = router;
