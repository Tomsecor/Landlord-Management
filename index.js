const dotenv = require('dotenv');
const { MongoClient, ObjectId } = require("mongodb");
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

// Global database connection and client
let dbClient = null;
let db = null;

// Initialize database connection
async function initializeDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI environment variable is not set.");
  }

  try {
    dbClient = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await dbClient.connect();
    db = dbClient.db("your_db_name"); // Replace with your actual database name
    console.log("Connected to database");
    return db;
  } catch (error) {
    console.error("Database connection failed:", error);
    throw error;
  }
}

// Helper function to get DB instance
function getDb() {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Update session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        dbName: process.env.MONGO_DB_NAME || 'your_db_name',
        collectionName: 'sessions',
        ttl: 24 * 60 * 60,
        autoRemove: 'native',
       // stringify: false // Add this to prevent session serialization issues
    }),
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000

  }));


// Auth middleware
const authMiddleware = (req, res, next) => {
    if (req.path === '/login.html' || 
        req.path === '/api/auth/login' || 
        req.path === '/api/auth/register') {
        return next();
    }

    if (!req.session || !req.session.userId) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        return res.redirect('/login.html');
    }

    next();
};

// Apply auth middleware to all routes
app.use(authMiddleware);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Root route handler - must be after static middleware
app.get('', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Registration route - add this before the login route
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDb();
        const usersCollection = db.collection('users');

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = {
            email,
            password: hashedPassword,
            created_at: new Date()
        };

        await usersCollection.insertOne(newUser);

        res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Update login route
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDb();
        
        const user = await db.collection('users').findOne({ email });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        // Set session data
        req.session.userId = user._id.toString();
        req.session.email = user.email;

        // Save session explicitly
        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) reject(err);
                resolve();
            });
        });

        //console.log('Login successful, session:', req.session);
        res.json({ success: true, message: 'Login successful' });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Registration route
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDb();
        const usersCollection = db.collection('users');

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const newUser = {
            email,
            password: hashedPassword,
            created_at: new Date()
        };

        await usersCollection.insertOne(newUser);

        res.status(201).json({ success: true, message: 'User registered successfully' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Logout route
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Error logging out' });
        }
        res.clearCookie('sessionId');
        res.json({ message: 'Logged out successfully' });
    });
});

// Add this route to check auth status
app.get('/api/auth/status', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
});

// POST route for adding tenants
app.post('/api/tenants', async (req, res) => {
    try {
        const db = getDb();
        const tenant = {
            name: req.body.name,
            unit_number: req.body.unit_number,
            property_id: req.body.property_id ? new ObjectId(req.body.property_id) : null,
            property_address: req.body.property_address,
            lease_start: req.body.lease_start ? new Date(req.body.lease_start) : null,
            lease_end: req.body.lease_end ? new Date(req.body.lease_end) : null,
            monthly_rent: parseFloat(req.body.monthly_rent) || 0,
            deposit: parseFloat(req.body.deposit) || 0,
            phone: req.body.phone || '',
            email: req.body.email || '',
            // Payment tracking fields
            lastPaymentStatus: false,
            lastPaymentMonth: null,
            lastPaymentYear: null,
            lastPaymentDate: null,
            paymentHistory: [],
            created_at: new Date()
        };
        
        const result = await db.collection('tenants').insertOne(tenant);
        res.status(201).json({ ...tenant, _id: result.insertedId });
    } catch (error) {
        console.error('Error creating tenant:', error);
        res.status(500).json({ error: 'Error creating tenant' });
    }
});

// POST route for adding payments
app.post('/payments', async (req, res) => {
  try {
    const db = getDb();
    const paymentsCollection = db.collection('payments');
    const tenantsCollection = db.collection('tenants');

    // Find tenant to get property_id
    const tenant = await tenantsCollection.findOne({ name: req.body.tenant_name });
    if (!tenant) {
      return res.status(400).send('Selected tenant does not exist');
    }

    const payment = {
      tenant_name: req.body.tenant_name,
      tenant_id: tenant._id,
      property_id: tenant.property_id,
      payment_date: new Date(req.body.payment_date),
      amount: parseFloat(req.body.amount) || tenant.monthly_rent || 0,
      payment_type: req.body.payment_type || 'Rent',
      payment_method: req.body.payment_method || 'Cash',
      paid: req.body.paid === 'on', // Checkbox value
      notes: req.body.notes || '',
      created_at: new Date()
    };
    await paymentsCollection.insertOne(payment);
    res.send('Payment added successfully');
  } catch (error) {
    console.error('Error adding payment:', error);
    res.status(500).send('Error adding payment');
  }
});

// API endpoint to get all tenants
app.get('/api/tenants', async (req, res) => {
    try {
        const db = getDb();
        const query = {};
        
        if (req.query.property_id) {
            query.property_id = new ObjectId(req.query.property_id);
        }

        const tenants = await db.collection('tenants')
            .find(query)
            .sort({ name: 1 })
            .toArray();

        // Enhance tenants with current month payment status
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();

        const enhancedTenants = tenants.map(tenant => ({
            ...tenant,
            currentMonthPaid: tenant.lastPaymentStatus && 
                            tenant.lastPaymentMonth === currentMonth &&
                            tenant.lastPaymentYear === currentYear
        }));
            
        res.json(enhancedTenants);
    } catch (error) {
        console.error('Error fetching tenants:', error);
        res.status(500).json({ error: 'Failed to fetch tenants' });
    }
});

// Remove all other versions of the payment status endpoint and replace with this one
app.put('/api/tenants/:id/payment-status', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const { hasPaid, paymentMonth, paymentYear } = req.body;
        
        // Get tenant details
        const tenant = await db.collection('tenants').findOne({ _id: new ObjectId(id) });
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Check if payment already exists for this month/year
        const existingPayment = await db.collection('payments').findOne({
            tenant_id: new ObjectId(id),
            month: paymentMonth,
            year: paymentYear
        });

        if (existingPayment && hasPaid) {
            return res.status(400).json({ 
                error: 'Payment already recorded for this month',
                existingPayment 
            });
        }

        const paymentRecord = {
            date: new Date(),
            amount: tenant.monthly_rent,
            month: paymentMonth,
            year: paymentYear,
            status: hasPaid ? 'paid' : 'unpaid'
        };

        // Update tenant's payment status and history
        const updateResult = await db.collection('tenants').updateOne(
            { _id: new ObjectId(id) },
            {
                $set: {
                    lastPaymentStatus: hasPaid,
                    lastPaymentMonth: paymentMonth,
                    lastPaymentYear: paymentYear,
                    lastPaymentDate: new Date()
                },
                $push: {
                    paymentHistory: {
                        $each: [paymentRecord],
                        $sort: { date: -1 },
                        $slice: 12 // Keep last 12 months of history
                    }
                }
            }
        );

        // If marking as paid, create payment record
        if (hasPaid && !existingPayment) {
            const payment = {
                tenant_id: new ObjectId(id),
                tenant_name: tenant.name,
                property_id: tenant.property_id,
                amount: tenant.monthly_rent,
                payment_date: new Date(),
                payment_type: 'Rent',
                payment_method: 'Auto-recorded',
                paid: true,
                month: paymentMonth,
                year: paymentYear,
                created_at: new Date()
            };

            await db.collection('payments').insertOne(payment);
        }

        res.json({ 
            success: true, 
            message: 'Payment status updated',
            updated: updateResult.modifiedCount > 0,
            paymentRecord
        });

    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ error: 'Error updating payment status' });
    }
});

// API endpoint to get all payments
app.get('/api/payments', async (req, res) => {
  try {
    const db = getDb();
    const paymentsCollection = db.collection('payments');
    const tenantsCollection = db.collection('tenants');
    const propertiesCollection = db.collection('properties');
    const { ObjectId } = require('mongodb');

    // Get property filter if provided
    const propertyId = req.query.property_id;
    const query = propertyId ? { property_id: new ObjectId(propertyId) } : {};

    // Get all payments (filtered by property if requested)
    const payments = await paymentsCollection.find(query).toArray();

    // Enhance payments with property and tenant info
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

// API endpoint to get tenants by property
app.get('/api/properties/:id/tenants', async (req, res) => {
  try {
    const db = getDb();
    const tenantsCollection = db.collection('tenants');
    const { ObjectId } = require('mongodb');

    const tenants = await tenantsCollection.find({ 
      property_id: new ObjectId(req.params.id) 
    }).toArray();

    res.json(tenants);
  } catch (error) {
    console.error('Error fetching property tenants:', error);
    res.status(500).json({ error: 'Failed to fetch property tenants' });
  }
});

// API endpoint to get payments by property
app.get('/api/properties/:id/payments', async (req, res) => {
  try {
    const db = getDb();
    const paymentsCollection = db.collection('payments');
    const { ObjectId } = require('mongodb');

    const payments = await paymentsCollection.find({ 
      property_id: new ObjectId(req.params.id) 
    }).toArray();

    res.json(payments);
  } catch (error) {
    console.error('Error fetching property payments:', error);
    res.status(500).json({ error: 'Failed to fetch property payments' });
  }
});

// API endpoint to get payments by tenant
app.get('/api/tenants/:id/payments', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const payments = await db.collection('payments')
        .find({ tenant_id: new ObjectId(id) })
        .sort({ payment_date: -1 })
        .toArray();
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching tenant payments:', error);
    res.status(500).json({ error: 'Failed to fetch tenant payments' });
  }
});

// API endpoint to get a single tenant
app.get('/api/tenants/:id', async (req, res) => {
  try {
    const db = getDb();
    const tenantsCollection = db.collection('tenants');
    const { ObjectId } = require('mongodb');
    const tenant = await tenantsCollection.findOne({ _id: new ObjectId(req.params.id) });

    if (tenant) {
      res.json(tenant);
    } else {
      res.status(404).json({ error: 'Tenant not found' });
    }
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({ error: 'Failed to fetch tenant' });
  }
});

// API endpoint to update a tenant
app.put('/api/tenants/:id', async (req, res) => {
  try {
    const db = getDb();
    const tenantsCollection = db.collection('tenants');
    const { ObjectId } = require('mongodb');
    
    const tenant = {
      name: req.body.name,
      unit_number: req.body.unit_number,
      property_id: req.body.property_id ? new ObjectId(req.body.property_id) : null,
      lease_start: req.body.lease_start ? new Date(req.body.lease_start) : null,
      lease_end: req.body.lease_end ? new Date(req.body.lease_end) : null,
      monthly_rent: parseFloat(req.body.monthly_rent) || 0,
      deposit: parseFloat(req.body.deposit) || 0,
      phone: req.body.phone || '',
      email: req.body.email || '',
      notes: req.body.notes || '',
      updated_at: new Date()
    };

    const result = await tenantsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: tenant }
    );

    if (result.matchedCount === 1) {
      res.json({ message: 'Tenant updated successfully' });
    } else {
      res.status(404).json({ error: 'Tenant not found' });
    }
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

// API endpoint to delete a tenant
app.delete('/api/tenants/:id', async (req, res) => {
  try {
    const db = getDb();
    const tenantsCollection = db.collection('tenants');
    const { ObjectId } = require('mongodb');
    const result = await tenantsCollection.deleteOne({ _id: new ObjectId(req.params.id) });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: 'Tenant deleted successfully' });
    } else {
      res.status(404).json({ error: 'Tenant not found' });
    }
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

// API endpoint to get a single payment
app.get('/api/payments/:id', async (req, res) => {
  try {
    const db = getDb();
    const paymentsCollection = db.collection('payments');
    const { ObjectId } = require('mongodb');
    const payment = await paymentsCollection.findOne({ _id: new ObjectId(req.params.id) });

    if (payment) {
      res.json(payment);
    } else {
      res.status(404).json({ error: 'Payment not found' });
    }
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
});

// API endpoint to update a payment
app.put('/api/payments/:id', async (req, res) => {
  try {
    const db = getDb();
    const paymentsCollection = db.collection('payments');
    const { ObjectId } = require('mongodb');
    
    const payment = {
      tenant_name: req.body.tenant_name,
      tenant_id: new ObjectId(req.body.tenant_id),
      property_id: req.body.property_id ? new ObjectId(req.body.property_id) : null,
      payment_date: new Date(req.body.payment_date),
      amount: parseFloat(req.body.amount) || 0,
      payment_type: req.body.payment_type || 'Rent',
      payment_method: req.body.payment_method || 'Cash',
      paid: req.body.paid === true || req.body.paid === 'true',
      notes: req.body.notes || '',
      updated_at: new Date()
    };

    const result = await paymentsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: payment }
    );

    if (result.matchedCount === 1) {
      res.json({ message: 'Payment updated successfully' });
    } else {
      res.status(404).json({ error: 'Payment not found' });
    }
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// API endpoint to delete a payment
app.delete('/api/payments/:id', async (req, res) => {
  try {
    const db = getDb();
    const paymentsCollection = db.collection('payments');
    const { ObjectId } = require('mongodb');
    const result = await paymentsCollection.deleteOne({ _id: new ObjectId(req.params.id) });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: 'Payment deleted successfully' });
    } else {
      res.status(404).json({ error: 'Payment not found' });
    }
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: 'Failed to delete payment' });
  }
});

// API endpoint to get payments for a tenant
app.get('/api/tenants/:id/payments', async (req, res) => {
  try {
    const db = getDb();
    const paymentsCollection = db.collection('payments');
    const { ObjectId } = require('mongodb');
    
    const payments = await paymentsCollection.find({ 
      tenant_id: new ObjectId(req.params.id) 
    }).toArray();
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching tenant payments:', error);
    res.status(500).json({ error: 'Failed to fetch tenant payments' });
  }
});

// API endpoints for properties
// Get all properties
app.get('/api/properties', async (req, res) => {
  try {
    const db = getDb();
    const propertiesCollection = db.collection('properties');
    
    const properties = await propertiesCollection.find({}).toArray();
    
    // Calculate monthly totals including both rent and mortgage
    const enhancedProperties = properties.map(property => ({
      ...property,
      monthly_mortgage: parseFloat(property.monthly_mortgage) || 0,
      rent: parseFloat(property.rent) || 0
    }));

    res.json(enhancedProperties);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// Get a single property
app.get('/api/properties/:id', async (req, res) => {
  try {
    const db = getDb();
    const propertiesCollection = db.collection('properties');
    const { ObjectId } = require('mongodb');
    const property = await propertiesCollection.findOne({ _id: new ObjectId(req.params.id) });

    if (property) {
      res.json(property);
    } else {
      res.status(404).json({ error: 'Property not found' });
    }
  } catch (error) {
    console.error('Error fetching property:', error);
    res.status(500).json({ error: 'Failed to fetch property' });
  }
});

// Add a new property
app.post('/api/properties', async (req, res) => {
  try {
    const db = getDb();
    const propertiesCollection = db.collection('properties');
    
    const property = {
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      zip: req.body.zip,
      type: req.body.type,
      bedrooms: parseInt(req.body.bedrooms) || 0,
      bathrooms: parseFloat(req.body.bathrooms) || 0,
      rent: parseFloat(req.body.rent) || 0,
      sqft: parseInt(req.body.sqft) || 0,
      purchase_price: parseFloat(req.body.purchase_price) || 0,
      purchase_date: req.body.purchase_date ? new Date(req.body.purchase_date) : null,
      monthly_mortgage: parseFloat(req.body.monthly_mortgage) || 0,
      notes: req.body.notes || '',
      created_at: new Date()
    };

    await propertiesCollection.insertOne(property);
    res.status(201).json(property);
  } catch (error) {
    console.error('Error adding property:', error);
    res.status(500).json({ error: 'Failed to add property' });
  }
});

// Update a property
app.put('/api/properties/:id', async (req, res) => {
  try {
    const db = getDb();
    const propertiesCollection = db.collection('properties');
    const { ObjectId } = require('mongodb');
    
    const property = {
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      zip: req.body.zip,
      type: req.body.type,
      bedrooms: parseInt(req.body.bedrooms) || 0,
      bathrooms: parseFloat(req.body.bathrooms) || 0,
      rent: parseFloat(req.body.rent) || 0,
      sqft: parseInt(req.body.sqft) || 0,
      purchase_price: parseFloat(req.body.purchase_price) || 0,
      purchase_date: req.body.purchase_date ? new Date(req.body.purchase_date) : null,
      monthly_mortgage: parseFloat(req.body.monthly_mortgage) || 0,
      notes: req.body.notes || '',
      updated_at: new Date()
    };

    const result = await propertiesCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: property }
    );

    if (result.matchedCount === 1) {
      res.json({ message: 'Property updated successfully' });
    } else {
      res.status(404).json({ error: 'Property not found' });
    }
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// Delete a property
app.delete('/api/properties/:id', async (req, res) => {
  try {
    const db = getDb();
    const propertiesCollection = db.collection('properties');
    const { ObjectId } = require('mongodb');
    const result = await propertiesCollection.deleteOne({ _id: new ObjectId(req.params.id) });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: 'Property deleted successfully' });
    } else {
      res.status(404).json({ error: 'Property not found' });
    }
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: 'Failed to delete property' });
  }
});

// API endpoint to get dashboard statistics
app.get('/api/statistics', async (req, res) => {
  try {
    const db = getDb();
    const tenantsCollection = db.collection('tenants');
    const paymentsCollection = db.collection('payments');
    const propertiesCollection = db.collection('properties');

    // Count total tenants
    const totalTenants = await tenantsCollection.countDocuments();

    // Count total properties
    const totalProperties = await propertiesCollection.countDocuments();

    // Calculate monthly income (sum of all paid payments in the current month)
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const paidPayments = await paymentsCollection.find({
      payment_date: {
        $gte: startOfMonth,
        $lte: endOfMonth
      },
      paid: true
    }).toArray();

    // Calculate actual income from payment amounts
    const monthlyIncome = paidPayments.reduce((total, payment) => total + (payment.amount || 0), 0);

    // Calculate total property value
    const properties = await propertiesCollection.find().toArray();
    const totalPropertyValue = properties.reduce((total, property) => total + (property.purchase_price || 0), 0);

    // Calculate occupancy rate
    const occupiedUnits = await tenantsCollection.countDocuments();
    const occupancyRate = totalProperties > 0 ? (occupiedUnits / totalProperties) * 100 : 0;

    // Calculate potential monthly income (sum of all property rents)
    const potentialMonthlyIncome = properties.reduce((total, property) => total + (property.rent || 0), 0);

    res.json({
      totalTenants,
      totalProperties,
      monthlyIncome,
      totalPropertyValue,
      occupancyRate: Math.round(occupancyRate),
      potentialMonthlyIncome,
      collectionRate: potentialMonthlyIncome > 0 ? Math.round((monthlyIncome / potentialMonthlyIncome) * 100) : 0
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// API endpoints for todos
// Get all todos for a property
app.get('/api/properties/:id/todos', async (req, res) => {
  try {
    const db = getDb();
    const todosCollection = db.collection('todos');
    const { ObjectId } = require('mongodb');
    
    let query = { Properties_id: new ObjectId(req.params.id) }; // Changed from property_id to Properties_id
    
    if (req.query.priority) {
      query.priority = req.query.priority;
    }
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    const todos = await todosCollection.find(query)
      .sort({ due_date: 1 })
      .toArray();
      
    res.json(todos);
  } catch (error) {
    console.error('Error fetching todos:', error);
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
});

// Add a new todo
app.post('/api/todos', async (req, res) => {
  try {
    const db = getDb();
    const todosCollection = db.collection('todos');
    const { ObjectId } = require('mongodb');
    
    const todo = {
      Properties_id: new ObjectId(req.body.Properties_id), // Changed from property_id
      title: req.body.title,
      description: req.body.description || '',
      due_date: req.body.due_date ? new Date(req.body.due_date) : null,
      priority: req.body.priority || 'medium',
      status: req.body.status || 'pending',
      assigned_to: req.body.assigned_to || '',
      estimated_cost: parseFloat(req.body.estimated_cost) || 0,
      created_at: new Date()
    };

    const result = await todosCollection.insertOne(todo);
    res.status(201).json({ message: 'Todo added successfully', id: result.insertedId });
  } catch (error) {
    console.error('Error adding todo:', error);
    res.status(500).json({ error: 'Failed to add todo' });
  }
});

// Update a todo
app.put('/api/todos/:id', async (req, res) => {
  try {
    const db = getDb();
    const todosCollection = db.collection('todos');
    const { ObjectId } = require('mongodb');
    
    const todo = {
      title: req.body.title,
      description: req.body.description || '',
      due_date: req.body.due_date ? new Date(req.body.due_date) : null,
      priority: req.body.priority || 'medium',
      status: req.body.status || 'pending',
      assigned_to: req.body.assigned_to || '',
      estimated_cost: parseFloat(req.body.estimated_cost) || 0,
      updated_at: new Date()
    };

    const result = await todosCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: todo }
    );

    if (result.matchedCount === 1) {
      res.json({ message: 'Todo updated successfully' });
    } else {
      res.status(404).json({ error: 'Todo not found' });
    }
  } catch (error) {
    console.error('Error updating todo:', error);
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// Get todo statistics for a property
app.get('/api/properties/:id/todo-stats', async (req, res) => {
  try {
    const db = getDb();
    const todosCollection = db.collection('todos');
    const { ObjectId } = require('mongodb');
    
    const PropertiesId = new ObjectId(req.params.id); // Changed from propertyId
    
    const stats = await todosCollection.aggregate([
      { $match: { Properties_id: PropertiesId } }, // Changed from property_id
      { $group: {
        _id: null,
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        highPriority: { $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] } },
        totalEstimatedCost: { $sum: "$estimated_cost" }
      }}
    ]).toArray();
    
    const result = stats[0] || {
      total: 0,
      completed: 0,
      highPriority: 0,
      totalEstimatedCost: 0
    };
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching todo statistics:', error);
    res.status(500).json({ error: 'Failed to fetch todo statistics' });
  }
});

// New endpoint to get all todos with filters
app.get('/api/todos', async (req, res) => {
  try {
    const db = getDb();
    const todosCollection = db.collection('todos');
    const { ObjectId } = require('mongodb');
    
    // Build query based on filters
    const query = {};
    
    if (req.query.property_id) {
      query.Properties_id = new ObjectId(req.query.property_id);
    }
    
    if (req.query.priority) {
      query.priority = req.query.priority;
    }
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    const todos = await todosCollection.find(query)
      .sort({ due_date: 1 })
      .toArray();
    
    res.json(todos);
  } catch (error) {
    console.error('Error fetching todos:', error);
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
});

// API endpoints for bills
// Get all bills
app.get('/api/bills', async (req, res) => {
  try {
    const db = getDb();
    const billsCollection = db.collection('bills');
    const propertiesCollection = db.collection('properties');
    const { ObjectId } = require('mongodb');

    // Get property filter if provided
    const propertyId = req.query.property_id;
    const query = propertyId ? { property_id: new ObjectId(propertyId) } : {};

    // Get all bills (filtered by property if requested)
    const bills = await billsCollection.find(query).toArray();

    // Enhance bills with property info
    const enhancedBills = await Promise.all(bills.map(async (bill) => {
      let propertyInfo = null;
      if (bill.property_id) {
        propertyInfo = await propertiesCollection.findOne({ _id: bill.property_id });
      }

      return {
        ...bill,
        propertyInfo: propertyInfo ? {
          address: propertyInfo.address,
          city: propertyInfo.city
        } : null
      };
    }));

    res.json(enhancedBills);
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

// Get a single bill
app.get('/api/bills/:id', async (req, res) => {
  try {
    const db = getDb();
    const billsCollection = db.collection('bills');
    const { ObjectId } = require('mongodb');
    const bill = await billsCollection.findOne({ _id: new ObjectId(req.params.id) });

    if (bill) {
      res.json(bill);
    } else {
      res.status(404).json({ error: 'Bill not found' });
    }
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json({ error: 'Failed to fetch bill' });
  }
});

// Add a new bill
app.post('/api/bills', async (req, res) => {
  try {
    const db = getDb();
    const billsCollection = db.collection('bills');
    const { ObjectId } = require('mongodb');
    
    const bill = {
      property_id: req.body.property_id ? new ObjectId(req.body.property_id) : null,
      bill_type: req.body.bill_type,
      amount: parseFloat(req.body.amount) || 0,
      due_date: req.body.due_date ? new Date(req.body.due_date) : null,
      paid: req.body.paid === 'true' || req.body.paid === true,
      payment_date: req.body.payment_date ? new Date(req.body.payment_date) : null,
      bill_period_start: req.body.bill_period_start ? new Date(req.body.bill_period_start) : null,
      bill_period_end: req.body.bill_period_end ? new Date(req.body.bill_period_end) : null,
      notes: req.body.notes || '',
      created_at: new Date(),
      recurring_monthly: req.body.recurring_monthly || false,
      parent_bill_id: null
    };

    const result = await billsCollection.insertOne(bill);
    res.status(201).json({ message: 'Bill added successfully', id: result.insertedId });
  } catch (error) {
    console.error('Error adding bill:', error);
    res.status(500).json({ error: 'Failed to add bill' });
  }
});

// Update a bill
app.put('/api/bills/:id', async (req, res) => {
  try {
    const db = getDb();
    const billsCollection = db.collection('bills');
    const { ObjectId } = require('mongodb');
    
    // Convert boolean values properly
    const bill = {
      property_id: req.body.property_id ? new ObjectId(req.body.property_id) : null,
      bill_type: req.body.bill_type,
      amount: parseFloat(req.body.amount) || 0,
      due_date: req.body.due_date ? new Date(req.body.due_date) : null,
      paid: req.body.paid === true,
      payment_date: req.body.payment_date ? new Date(req.body.payment_date) : null,
      bill_period_start: req.body.bill_period_start ? new Date(req.body.bill_period_start) : null,
      bill_period_end: req.body.bill_period_end ? new Date(req.body.bill_period_end) : null,
      notes: req.body.notes || '',
      recurring_monthly: req.body.recurring_monthly === true,
      updated_at: new Date()
    };

   // console.log('Updating bill with data:', bill); // Debug log

    const result = await billsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: bill }
    );

    if (result.matchedCount === 1) {
      res.json({ message: 'Bill updated successfully', data: bill });
    } else {
      res.status(404).json({ error: 'Bill not found' });
    }
  } catch (error) {
    console.error('Error updating bill:', error);
    res.status(500).json({ error: 'Failed to update bill' });
  }
});

// Delete a bill
app.delete('/api/bills/:id', async (req, res) => {
  try {
    const db = getDb();
    const billsCollection = db.collection('bills');
    const { ObjectId } = require('mongodb');
    const result = await billsCollection.deleteOne({ _id: new ObjectId(req.params.id) });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: 'Bill deleted successfully' });
    } else {
      res.status(404).json({ error: 'Bill not found' });
    }
  } catch (error) {
    console.error('Error deleting bill:', error);
    res.status(500).json({ error: 'Failed to delete bill' });
  }
});

// Get bills by property
app.get('/api/properties/:id/bills', async (req, res) => {
  try {
    const db = getDb();
    const billsCollection = db.collection('bills');
    const { ObjectId } = require('mongodb');
    
    const bills = await billsCollection.find({ 
      property_id: new ObjectId(req.params.id) 
    }).toArray();
    
    res.json(bills);
  } catch (error) {
    console.error('Error fetching property bills:', error);
    res.status(500).json({ error: 'Failed to fetch property bills' });
  }
});

// Get recurring bills by property
app.get('/api/properties/:id/recurring-bills', async (req, res) => {
    try {
        const db = getDb();
        const billsCollection = db.collection('bills');
        const { ObjectId } = require('mongodb');
        
        const bills = await billsCollection.find({ 
            property_id: new ObjectId(req.params.id),
            recurring_monthly: true
        }).toArray();
        
        res.json(bills);
    } catch (error) {
        console.error('Error fetching recurring bills:', error);
        res.status(500).json({ error: 'Failed to fetch recurring bills' });
    }
});

// Create recurring bill instance for current month
app.post('/api/bills/create-monthly-instance', async (req, res) => {
    try {
        const db = getDb();
        const billsCollection = db.collection('bills');
        const { bill_id } = req.body;

        // Get the template bill
        const templateBill = await billsCollection.findOne({ 
            _id: new ObjectId(bill_id)
        });

        if (!templateBill) {
            return res.status(404).json({ error: 'Template bill not found' });
        }

        // Create new instance for current month
        const currentDate = new Date();
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        const newBill = {
            ...templateBill,
            _id: new ObjectId(),
            parent_bill_id: templateBill._id,
            due_date: startOfMonth,
            bill_period_start: startOfMonth,
            bill_period_end: endOfMonth,
            paid: false,
            payment_date: null,
            created_at: new Date()
        };

        await billsCollection.insertOne(newBill);
        res.json(newBill);
    } catch (error) {
        console.error('Error creating monthly bill instance:', error);
        res.status(500).json({ error: 'Failed to create monthly bill instance' });
    }
});

// Mileage routes
app.get('/api/mileage', async (req, res) => {
    try {
        const db = getDb();
        const mileage = await db.collection('mileage')
            .find()
            .sort({ date: -1 })
            .toArray();
        res.json(mileage);
    } catch (error) {
        console.error('Error fetching mileage:', error);
        res.status(500).json({ error: 'Failed to fetch mileage entries' });
    }
});

app.get('/api/mileage/:id', async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        const mileage = await db.collection('mileage').findOne({
            _id: new ObjectId(req.params.id)
        });
        if (!mileage) {
            return res.status(404).json({ error: 'Mileage entry not found' });
        }
        res.json(mileage);
    } catch (error) {
        console.error('Error fetching mileage:', error);
        res.status(500).json({ error: 'Failed to fetch mileage entry' });
    }
});

app.post('/api/mileage', async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        
        const mileageEntry = {
            date: new Date(req.body.date),
            total_miles: parseFloat(req.body.total_miles),
            purpose: req.body.purpose,
            notes: req.body.notes,
            tax_deductible: req.body.tax_deductible,
            created_at: new Date()
        };
           
        // If property_id is provided, get property details and add property name
        if (req.body.property_id) {
            mileageEntry.property_id = req.body.property_id;
            const property = await db.collection('properties').findOne({
                _id: new ObjectId(req.body.property_id)
            });
            if (property) {
                mileageEntry.property_name = property.address;
            }
        }

        const result = await db.collection('mileage').insertOne(mileageEntry);
        res.status(201).json({ ...mileageEntry, _id: result.insertedId });
    } catch (error) {
        console.error('Error creating mileage entry:', error);
        res.status(500).json({ error: 'Failed to create mileage entry' });
    }
});

app.put('/api/mileage/:id', async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        
        const mileageEntry = {
            date: new Date(req.body.date),
            total_miles: parseFloat(req.body.total_miles),
            purpose: req.body.purpose,
            notes: req.body.notes,
            tax_deductible: req.body.tax_deductible,
            updated_at: new Date()
        };

        // If property_id is provided, update property details
        if (req.body.property_id) {
            mileageEntry.property_id = req.body.property_id;
            const property = await db.collection('properties').findOne({
                _id: new ObjectId(req.body.property_id)
            });
            if (property) {
                mileageEntry.property_name = property.address;
            }
        }

        const result = await db.collection('mileage').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: mileageEntry }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Mileage entry not found' });
        }
        res.json({ message: 'Mileage entry updated successfully' });
    } catch (error) {
        console.error('Error updating mileage:', error);
        res.status(500).json({ error: 'Failed to update mileage entry' });
    }
});

app.delete('/api/mileage/:id', async (req, res) => {
    try {
        const db = getDb();
        const { ObjectId } = require('mongodb');
        
        const result = await db.collection('mileage').deleteOne({
            _id: new ObjectId(req.params.id)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Mileage entry not found' });
        }
        res.json({ message: 'Mileage entry deleted successfully' });
    } catch (error) {
        console.error('Error deleting mileage:', error);
        res.status(500).json({ error: 'Failed to delete mileage entry' });
    }
});

// Add new endpoint to update tenant payment status
app.put('/api/tenants/:id/payment-status', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        const { hasPaid, paymentMonth, paymentYear } = req.body;

        // Update tenant payment status
        await db.collection('tenants').updateOne(
            { _id: new ObjectId(id) },
            { $set: { 
                lastPaymentStatus: hasPaid,
                lastPaymentMonth: paymentMonth,
                lastPaymentYear: paymentYear,
                lastPaymentDate: new Date()
            }}
        );

        // If paid, create payment record automatically
        if (hasPaid) {
            const tenant = await db.collection('tenants').findOne({ _id: new ObjectId(id) });
            const payment = {
                tenant_id: id,
                tenant_name: tenant.name,
                property_id: tenant.property_id,
                amount: tenant.monthly_rent,
                payment_date: new Date(),
                payment_type: 'Rent',
                payment_method: 'Cash', // Default method
                paid: true,
                month: paymentMonth,
                year: paymentYear,
                created_at: new Date()
            };

            await db.collection('payments').insertOne(payment);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ error: 'Error updating payment status' });
    }
});

// Ensure all routes are handled properly
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/login.html');
    }
});

// Add this after all your routes
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).sendFile(path.join(__dirname, 'public', '404.html'));
});

// Modified server startup
const port = process.env.PORT || 8080;

// Initialize database before starting server
initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (dbClient) {
    await dbClient.close();
    console.log('Database connection closed');
  }
  process.exit(0);
});

// GET endpoint for tenant payment history
app.get('/api/tenants/:id/payment-history', async (req, res) => {
    try {
        const db = getDb();
        const { id } = req.params;
        
        const tenant = await db.collection('tenants').findOne(
            { _id: new ObjectId(id) },
            { projection: { paymentHistory: 1 } }
        );
        
        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json(tenant.paymentHistory || []);
    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).json({ error: 'Error fetching payment history' });
    }
});

// Add new bills stats endpoint
app.get('/api/bills/stats', async (req, res) => {
  try {
    const db = getDb();
    const billsCollection = db.collection('bills');
    
    const totalBills = await billsCollection.countDocuments();
    
    const unpaidBills = await billsCollection.countDocuments({ paid: false });
    
    const bills = await billsCollection.find({ paid: false }).toArray();
    const totalAmountDue = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);

    res.json({
      totalBills,
      unpaidBills,
      totalAmountDue
    });
  } catch (error) {
    console.error('Error fetching bill statistics:', error);
    res.status(500).json({ error: 'Failed to fetch bill statistics' });
  }
});

// Update the bill PUT endpoint
app.put('/api/bills/:id', async (req, res) => {
  try {
    const db = getDb();
    const billsCollection = db.collection('bills');
    const { ObjectId } = require('mongodb');
    
    const bill = {
      property_id: req.body.property_id ? new ObjectId(req.body.property_id) : null,
      bill_type: req.body.bill_type,
      amount: parseFloat(req.body.amount) || 0,
      due_date: req.body.due_date ? new Date(req.body.due_date) : null,
      paid: req.body.paid === true,
      payment_date: req.body.payment_date ? new Date(req.body.payment_date) : null,
      bill_period_start: req.body.bill_period_start ? new Date(req.body.bill_period_start) : null,
      bill_period_end: req.body.bill_period_end ? new Date(req.body.bill_period_end) : null,
      notes: req.body.notes || '',
      recurring_monthly: req.body.recurring_monthly === true,
      updated_at: new Date()
    };

    const result = await billsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: bill }
    );

    if (result.matchedCount === 1) {
      res.json({ message: 'Bill updated successfully', data: bill });
    } else {
      res.status(404).json({ error: 'Bill not found' });
    }
  } catch (error) {
    console.error('Error updating bill:', error);
    res.status(500).json({ error: 'Failed to update bill' });
  }
});