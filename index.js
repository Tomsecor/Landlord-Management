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
    const tenant = {
      name: req.body.name,
      unit_number: req.body.unit_number
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
    const payment = {
      tenant_name: req.body.tenant_name,
      payment_date: new Date(req.body.payment_date),
      paid: req.body.paid === 'on' // Checkbox value
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
    
    // Get all tenants
    const tenants = await tenantsCollection.find().toArray();
    
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
      
      return {
        ...tenant,
        paymentStatus: payment && payment.paid ? 'Paid' : 'Not Paid'
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
    const payments = await paymentsCollection.find().toArray();
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payments:', error);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// API endpoint to delete a tenant
app.delete('/api/tenants/:id', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const tenantsCollection = db.collection('tenants');
    const result = await tenantsCollection.deleteOne({ _id: new require('mongodb').ObjectId(req.params.id) });
    
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
    const result = await paymentsCollection.deleteOne({ _id: new require('mongodb').ObjectId(req.params.id) });
    
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

// API endpoint to get dashboard statistics
app.get('/api/statistics', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const tenantsCollection = db.collection('tenants');
    const paymentsCollection = db.collection('payments');
    
    // Count total tenants
    const totalTenants = await tenantsCollection.countDocuments();
    
    // Count unique properties (unit numbers)
    const uniqueProperties = await tenantsCollection.distinct('unit_number');
    const totalProperties = uniqueProperties.length;
    
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
    
    // Assuming each payment is $1000 (you might want to add an amount field to your payments model)
    const monthlyIncome = paidPayments.length * 1000;
    
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

