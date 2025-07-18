const express = require("express");
const cors = require("cors");
// const app = express();
const dotenv = require("dotenv");

dotenv.config();
// require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@iftekharbases.ulu3uwc.mongodb.net/?retryWrites=true&w=majority&appName=IftekharBases`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    //   console.log("mongodb connected");
    const database = client.db("realestate");

    const usersCollection = database.collection("users");

    // ✅ POST: Create user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const existing = await usersCollection.findOne({ email: user.email });

      if (existing) {
        return res.status(400).json({ message: "User already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.status(201).json({ insertedId: result.insertedId });
    });

    // ✅ GET: All users
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.status(200).json(users);
    });

    // ✅ GET: Single user by email (optional, useful for role)
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(200).json(user);
    });

    console.log("✅ MongoDB connected and users collection ready");
  } catch (err) {
    console.error("Mongo error:", err);

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("🔥🔥🔥Real estate Is Cooking");
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
