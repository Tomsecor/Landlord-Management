const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const router = express.Router();

// Get all tenants or filter by property
router.get('/', async (req, res) => {
    try {
        const db = getDb();
        const query = {};
        
        if (req.query.property_id) {
            query.property_id = req.query.property_id;
        }

        const tenants = await db.collection('tenants')
            .find(query)
            .toArray();

        // Enhance tenant data with property info and payment status
        const enhancedTenants = await Promise.all(tenants.map(async (tenant) => {
            // Get property info
            const property = tenant.property_id ? 
                await db.collection('properties').findOne({ _id: new ObjectId(tenant.property_id) }) : 
                null;

            // Get last payment
            const lastPayment = await db.collection('payments')
                .findOne(
                    { tenant_id: tenant._id, paid: true },
                    { sort: { payment_date: -1 } }
                );

            return {
                ...tenant,
                property_address: property ? property.address : 'Unknown',
                lastPaymentDate: lastPayment?.payment_date || null,
                lastPaymentAmount: lastPayment?.amount || null,
                lastPaymentMonth: lastPayment ? new Date(lastPayment.payment_date).getMonth() + 1 : null,
                lastPaymentYear: lastPayment ? new Date(lastPayment.payment_date).getFullYear() : null,
                paymentStatus: lastPayment ? 'current' : 'pending'
            };
        }));

        res.json(enhancedTenants);
    } catch (error) {
        console.error('Error fetching tenants:', error);
        res.status(500).json({ error: 'Failed to fetch tenants' });
    }
});

// Get single tenant with enhanced payment info
router.get('/:id', async (req, res) => {
    try {
        const db = getDb();
        const tenant = await db.collection('tenants')
            .findOne({ _id: new ObjectId(req.params.id) });
        
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Get property info
        const property = tenant.property_id ? 
            await db.collection('properties').findOne({ _id: new ObjectId(tenant.property_id) }) : 
            null;

        // Get payment history
        const payments = await db.collection('payments')
            .find({ tenant_id: tenant._id })
            .sort({ payment_date: -1 })
            .limit(24)
            .toArray();

        // Format payment history
        const paymentHistory = payments.map(payment => ({
            date: payment.payment_date,
            amount: payment.amount,
            status: payment.paid ? 'paid' : 'unpaid',
            payment_type: payment.payment_type,
            payment_method: payment.payment_method,
            month: new Date(payment.payment_date).getMonth() + 1,
            year: new Date(payment.payment_date).getFullYear(),
            payment_id: payment._id
        }));

        res.json({
            ...tenant,
            property_address: property ? property.address : 'Unknown',
            paymentHistory,
            paymentStatus: payments[0]?.paid ? 'current' : 'pending'
        });
    } catch (error) {
        console.error('Error fetching tenant:', error);
        res.status(500).json({ error: 'Failed to fetch tenant' });
    }
});

// Create new tenant with payment history initialization
router.post('/', async (req, res) => {
    try {
        const db = getDb();
        const tenant = {
            ...req.body,
            created_at: new Date(),
            updated_at: new Date(),
            paymentHistory: [], // Initialize empty payment history
            paymentStatus: 'new', // Initial status
            lastPaymentDate: null,
            lastPaymentAmount: null
        };

        const result = await db.collection('tenants').insertOne(tenant);
        res.status(201).json({ 
            success: true, 
            _id: result.insertedId 
        });
    } catch (error) {
        console.error('Error creating tenant:', error);
        res.status(500).json({ error: 'Failed to create tenant' });
    }
});

// Update tenant with payment history preservation
router.put('/:id', async (req, res) => {
    try {
        const db = getDb();
        const { paymentHistory, ...updateData } = req.body; // Exclude paymentHistory from direct updates
        updateData.updated_at = new Date();

        const result = await db.collection('tenants').updateOne(
            { _id: new ObjectId(req.params.id) },
            { 
                $set: updateData,
                $setOnInsert: { paymentHistory: [] } // Preserve existing payment history
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json({ success: true, modified: result.modifiedCount > 0 });
    } catch (error) {
        console.error('Error updating tenant:', error);
        res.status(500).json({ error: 'Failed to update tenant' });
    }
});

// Delete tenant
router.delete('/:id', async (req, res) => {
    try {
        const db = getDb();
        const result = await db.collection('tenants')
            .deleteOne({ _id: new ObjectId(req.params.id) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting tenant:', error);
        res.status(500).json({ error: 'Failed to delete tenant' });
    }
});

async function updateTenantPaymentHistory(db, tenantId, payment) {
    try {
        const now = new Date();
        const historyEntry = {
            date: payment.payment_date || now,
            amount: payment.amount,
            status: payment.paid ? 'paid' : 'unpaid',
            payment_type: payment.payment_type,
            payment_method: payment.payment_method,
            month: (payment.payment_date || now).getMonth() + 1,
            year: (payment.payment_date || now).getFullYear(),
            payment_id: payment._id,
            recorded_at: now
        };

        // Update tenant's payment history
        await db.collection('tenants').updateOne(
            { _id: new ObjectId(tenantId) },
            { 
                $push: { 
                    paymentHistory: {
                        $each: [historyEntry],
                        $sort: { date: -1 },
                        $slice: 24 // Keep last 24 months of history
                    }
                },
                $set: {
                    lastPaymentDate: payment.payment_date || now,
                    lastPaymentAmount: payment.amount,
                    paymentStatus: payment.paid ? 'current' : 'late'
                }
            }
        );
    } catch (error) {
        console.error('Error updating tenant payment history:', error);
        throw error;
    }
}

router.put('/:id/payment-status', async (req, res) => {
    try {
        const db = getDb();
        const { hasPaid, paymentMonth, paymentYear, amount } = req.body;
        
        const payment = {
            _id: new ObjectId(),
            payment_date: new Date(),
            amount: amount,
            paid: hasPaid,
            payment_type: 'Rent',
            payment_method: 'System Record',
            tenant_id: new ObjectId(req.params.id)
        };

        // Update payment history
        await updateTenantPaymentHistory(db, req.params.id, payment);

        // Record the payment
        await db.collection('payments').insertOne(payment);

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating tenant payment status:', error);
        res.status(500).json({ error: 'Failed to update payment status' });
    }
});

module.exports = router;
