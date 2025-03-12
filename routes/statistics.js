const express = require('express');
const { ObjectId } = require('mongodb');
const { getDb } = require('../db');
const router = express.Router();

// Get bills statistics
router.get('/bills', async (req, res) => {
    try {
        const db = getDb();
        const pipeline = [
            {
                $group: {
                    _id: null,
                    totalBills: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    paidBills: { 
                        $sum: { $cond: ['$paid', 1, 0] }
                    },
                    unpaidAmount: {
                        $sum: { $cond: ['$paid', 0, '$amount'] }
                    }
                }
            }
        ];

        const stats = await db.collection('bills').aggregate(pipeline).toArray();
        res.json(stats[0] || {
            totalBills: 0,
            totalAmount: 0,
            paidBills: 0,
            unpaidAmount: 0
        });
    } catch (error) {
        console.error('Error fetching bill statistics:', error);
        res.status(500).json({ error: 'Failed to fetch bill statistics' });
    }
});

// Get mileage statistics
router.get('/mileage', async (req, res) => {
    try {
        const db = getDb();
        const pipeline = [
            {
                $group: {
                    _id: null,
                    totalMiles: { $sum: '$total_miles' },
                    deductibleMiles: {
                        $sum: {
                            $cond: ['$tax_deductible', '$total_miles', 0]
                        }
                    },
                    totalEntries: { $sum: 1 }
                }
            }
        ];

        const stats = await db.collection('mileage').aggregate(pipeline).toArray();
        res.json(stats[0] || {
            totalMiles: 0,
            deductibleMiles: 0,
            totalEntries: 0
        });
    } catch (error) {
        console.error('Error fetching mileage statistics:', error);
        res.status(500).json({ error: 'Failed to fetch mileage statistics' });
    }
});

// Get dashboard statistics
router.get('/', async (req, res) => {
    try {
        const db = getDb();
        
        // Get total tenants
        const totalTenants = await db.collection('tenants').countDocuments();
        
        // Get total properties
        const totalProperties = await db.collection('properties').countDocuments();
        
        // Calculate monthly income (from current month's payments)
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        
        const payments = await db.collection('payments')
            .find({
                payment_date: { $gte: startOfMonth },
                paid: true
            })
            .toArray();
            
        const monthlyIncome = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);

        res.json({
            totalTenants,
            totalProperties,
            monthlyIncome
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

module.exports = router;
