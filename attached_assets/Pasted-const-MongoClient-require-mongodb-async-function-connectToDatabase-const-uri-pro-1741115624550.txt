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
      unit_number: req.body.unit_number,
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
    async function checkTenantPayment(unitNumber, paymentDate) {
      const payment = await paymentsCollection.findOne({
        unit_number: unitNumber,
        payment_date: paymentDate,
      });
      console.log("Payment found for", unitNumber, "on", paymentDate.toDateString(), ":", payment);
      if (payment && payment.paid) {
        console.log(`${unitNumber} has paid for ${paymentDate.toDateString()}`);
      } else {
        console.log(`${unitNumber} has not paid for ${paymentDate.toDateString()}`);
      }
    }

    // List all tenants with payment status
    async function listTenantsWithStatus(paymentDate) {
      const payments = await paymentsCollection.find({ payment_date: paymentDate }).toArray();
      console.log("Payments for", paymentDate.toDateString(), ":", payments);
      const paidUnits = payments.filter((p) => p.paid).map((p) => p.unit_number);
      const tenants = await tenantsCollection.find().toArray();
      console.log("Tenants:", tenants);
      tenants.forEach((tenant) => {
        const status = paidUnits.includes(tenant.unit_number) ? "Paid" : "Not Paid";
        console.log(`${tenant.name} (${tenant.unit_number}): ${status}`);
      });
    }

    // Run the functions
    const exampleDate = new Date("2023-10-01T00:00:00Z"); // UTC date
    await checkTenantPayment("Apartment 5", exampleDate);
    await listTenantsWithStatus(exampleDate);

    console.log("All operations completed.");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main().catch(console.error);

