const { MongoClient } = require("mongodb");


async function connectToDatabase() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI environment variable is not set.");
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    console.log("Connected to database");
    return client.db("your_db_name"); // Replace with your actual database name
  } catch (error) {
    console.error("Database connection failed:", error);
    throw error;
  }
}


const express = require('express');
const app = express();

app.use(express.urlencoded({ extended: true })); // To parse form data
app.use(express.static('public')); // Serve static files from 'public' folder

// POST route for adding tenants
app.post('/tenants', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const tenantsCollection = db.collection('tenants');
    const propertiesCollection = db.collection('properties');

    // Check if property exists
    const { ObjectId } = require('mongodb');
    const property = await propertiesCollection.findOne({ _id: new ObjectId(req.body.property_id) });
    if (!property && req.body.property_id) {
      return res.status(400).send('Selected property does not exist');
    }

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
      created_at: new Date()
    };
    await tenantsCollection.insertOne(tenant);
    res.send('Tenant added successfully');
  } catch (error) {
    console.error('Error adding tenant:', error);
    res.status(500).send('Error adding tenant');
  }
});

// POST route for adding payments
app.post('/payments', async (req, res) => {
  try {
    const db = await connectToDatabase();
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
    const db = await connectToDatabase();
    const tenantsCollection = db.collection('tenants');
    const paymentsCollection = db.collection('payments');
    const propertiesCollection = db.collection('properties');
    const { ObjectId } = require('mongodb');

    // Get property filter if provided
    const propertyId = req.query.property_id;
    const query = propertyId ? { property_id: new ObjectId(propertyId) } : {};

    // Get all tenants (filtered by property if requested)
    const tenants = await tenantsCollection.find(query).toArray();

    // Get current month payment status for each tenant
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const enhancedTenants = await Promise.all(tenants.map(async (tenant) => {
      const payment = await paymentsCollection.findOne({
        tenant_name: tenant.name,
        payment_date: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      });

      // Get property information
      let propertyInfo = null;
      if (tenant.property_id) {
        propertyInfo = await propertiesCollection.findOne({ _id: tenant.property_id });
      }

      return {
        ...tenant,
        paymentStatus: payment && payment.paid ? 'Paid' : 'Not Paid',
        propertyInfo: propertyInfo ? {
          address: propertyInfo.address,
          city: propertyInfo.city
        } : null
      };
    }));

    res.json(enhancedTenants);
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants' });
  }
});

// API endpoint to get all payments
app.get('/api/payments', async (req, res) => {
  try {
    const db = await connectToDatabase();
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
    const db = await connectToDatabase();
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
    const db = await connectToDatabase();
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

// API endpoint to delete a tenant
app.delete('/api/tenants/:id', async (req, res) => {
  try {
    const db = await connectToDatabase();
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

// API endpoint to delete a payment
app.delete('/api/payments/:id', async (req, res) => {
  try {
    const db = await connectToDatabase();
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

// API endpoints for properties
// Get all properties
app.get('/api/properties', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const propertiesCollection = db.collection('properties');
    const properties = await propertiesCollection.find().toArray();
    res.json(properties);
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// Get a single property
app.get('/api/properties/:id', async (req, res) => {
  try {
    const db = await connectToDatabase();
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
    const db = await connectToDatabase();
    const propertiesCollection = db.collection('properties');
    const property = {
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      zip: req.body.zip,
      type: req.body.type,
      bedrooms: parseInt(req.body.bedrooms) || 0,
      bathrooms: parseFloat(req.body.bathrooms) || 0,
      sqft: parseInt(req.body.sqft) || 0,
      rent: parseFloat(req.body.rent) || 0,
      purchase_price: parseFloat(req.body.purchase_price) || 0,
      purchase_date: req.body.purchase_date ? new Date(req.body.purchase_date) : null,
      notes: req.body.notes || '',
      created_at: new Date()
    };

    const result = await propertiesCollection.insertOne(property);
    res.status(201).json({ message: 'Property added successfully', id: result.insertedId });
  } catch (error) {
    console.error('Error adding property:', error);
    res.status(500).json({ error: 'Failed to add property' });
  }
});

// Update a property
app.put('/api/properties/:id', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const propertiesCollection = db.collection('properties');
    const property = {
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      zip: req.body.zip,
      type: req.body.type,
      bedrooms: parseInt(req.body.bedrooms) || 0,
      bathrooms: parseFloat(req.body.bathrooms) || 0,
      sqft: parseInt(req.body.sqft) || 0,
      rent: parseFloat(req.body.rent) || 0,
      purchase_price: parseFloat(req.body.purchase_price) || 0,
      purchase_date: req.body.purchase_date ? new Date(req.body.purchase_date) : null,
      notes: req.body.notes || '',
      updated_at: new Date()
    };
    const { ObjectId } = require('mongodb');

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
    const db = await connectToDatabase();
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
    const db = await connectToDatabase();
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

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

async function main() {
  try {
    // Connect to the database
    const db = await connectToDatabase();
    console.log("Connected to database:", db.databaseName);

    // Access the collections
    const tenantsCollection = db.collection("tenants");
    const paymentsCollection = db.collection("payments");

    // Sample data insertion is commented out to rely on user input
    /*
    const tenantCount = await tenantsCollection.countDocuments();
    if (tenantCount === 0) {
      await tenantsCollection.insertMany([
        { name: "John Doe", unit_number: "Apartment 5" },
        { name: "Jane Smith", unit_number: "Apartment 10" },
      ]);
      console.log("Sample tenants added.");
    }

    const paymentCount = await paymentsCollection.countDocuments();
    if (paymentCount === 0) {
      const paymentDate = new Date("2023-10-01"); // Use the first day of the month
      await paymentsCollection.insertMany([
        { unit_number: "Apartment 5", payment_date: paymentDate, paid: true },
        { unit_number: "Apartment 10", payment_date: paymentDate, paid: false },
      ]);
      console.log("Sample payments added for October 2023.");
    }
    */

    // Check a tenant's payment status
    async function checkTenantPayment(tenantName, paymentDate) {
      const payment = await paymentsCollection.findOne({
        tenant_name: tenantName,
        payment_date: paymentDate,
      });
      console.log("Payment found for", tenantName, "on", paymentDate.toDateString(), ":", payment);
      if (payment && payment.paid) {
        console.log(`${tenantName} has paid for ${paymentDate.toDateString()}`);
      } else {
        console.log(`${tenantName} has not paid for ${paymentDate.toDateString()}`);
      }
    }

    // List all tenants with payment status
    async function listTenantsWithStatus(paymentDate) {
      const payments = await paymentsCollection.find({ payment_date: paymentDate }).toArray();
      console.log("Payments for", paymentDate.toDateString(), ":", payments);
      const paidTenants = payments.filter((p) => p.paid).map((p) => p.tenant_name);
      const tenants = await tenantsCollection.find().toArray();
      console.log("Tenants:", tenants);
      tenants.forEach((tenant) => {
        const status = paidTenants.includes(tenant.name) ? "Paid" : "Not Paid";
        console.log(`${tenant.name} (${tenant.unit_number}): ${status}`);
      });
    }

    // Run the functions
    const exampleDate = new Date("2023-10-01T00:00:00Z"); // UTC date
    await checkTenantPayment("John Doe", exampleDate);
    await listTenantsWithStatus(exampleDate);

    console.log("All operations completed.");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main().catch(console.error);