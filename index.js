const express = require("express");
const cors = require("cors");

const multer = require("multer");

const dotenv = require("dotenv");

dotenv.config();
// require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Multer setup
const storage = multer.memoryStorage();
const multerUpload = multer({ storage }); // Call multer() properly
const upload = multerUpload.fields([
  { name: "mainImage", maxCount: 1 },
  { name: "gallery", maxCount: 10 },
]);

var admin = require("firebase-admin");

var serviceAccount = require("./FB_TOKEN.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(
  cors({
    origin: "http://localhost:5173", // frontend URL
    credentials: true, // allow cookies/headers
  })
);
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const adminsCollection = database.collection("admins");
    const agentsCollection = database.collection("agents");
    const propertiesCollection = database.collection("properties");

    // verifyFB Token

    const verifyFBToken = async (req, res, next) => {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).send("Unauthorized");

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (err) {
        res.status(403).send("Forbidden");
      }
    };

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
    app.get("/users/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.status(200).json(user);
    });

    // PATCH: Make user Admin and add to admin collection
    app.patch("/users/make-admin/:id", async (req, res) => {
      const { id } = req.params;

      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user) return res.status(404).send({ message: "User not found" });

      // Update role in users collection
      const userUpdate = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "admin" } }
      );

      // Check if already in admins collection
      const adminExists = await adminsCollection.findOne({ email: user.email });
      if (!adminExists) {
        await adminsCollection.insertOne({
          name: user.name,
          email: user.email,
          role: "admin",
          createdAt: new Date(),
        });
      }

      res.send({ message: "User is now admin", updated: userUpdate });
    });

    // PATCH: Make user Agent and add to agent collection
    app.patch("/users/make-agent/:id", async (req, res) => {
      const { id } = req.params;

      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user) return res.status(404).send({ message: "User not found" });

      const userUpdate = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "agent" } }
      );

      // Check if already in agents collection
      const agentExists = await agentsCollection.findOne({ email: user.email });
      if (!agentExists) {
        await agentsCollection.insertOne({
          name: user.name,
          email: user.email,
          role: "agent",
          // image: user.image,
          createdAt: new Date(),
        });
      }

      // console.log(image);

      res.send({ message: "User is now agent", updated: userUpdate });
    });

    // get role by email

    // Middleware: verifyFBToken must be already setup
    app.get("/users/role/:email", verifyFBToken, async (req, res) => {
      const email = req.decoded.email;
      if (!email) {
        return res.status(400).send({ message: "No email in token" });
      }

      const user = await usersCollection.findOne({ email });
      if (!user) {
        return res.status(404).send({ message: "User not found" });
      }

      res.send({ role: user.role });
    });

    // DELETE user
    app.delete("/users/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user) return res.status(404).send({ message: "User not found" });
      console.log("Received DELETE request for ID:", req.params.id);

      await usersCollection.deleteOne({ _id: new ObjectId(id) });

      // Remove from admins or agents collection as well
      if (user.role === "admin") {
        await adminsCollection.deleteOne({ email: user.email });
      }
      if (user.role === "agent") {
        await agentsCollection.deleteOne({ email: user.email });
      }

      // Delete from Firebase Auth
      try {
        await admin.auth().deleteUser(user.uid);
      } catch {
        console.log("Firebase user not found or already deleted.");
      }

      res.send({ message: "User deleted successfully" });
    });

    // add property
    // API route for adding property
    app.post("/properties", upload, async (req, res) => {
      try {
        const { title, location, basePrice, maxPrice, agentName, agentEmail } =
          req.body;

        const mainImage = req.files["mainImage"]?.[0]?.buffer;
        const gallery = req.files["gallery"]?.map((file) => file.buffer) || [];

        const propertyData = {
          title,
          location,
          basePrice: Number(basePrice),
          maxPrice: Number(maxPrice),
          agentName,
          agentEmail,
          mainImage,
          gallery,
          createdAt: new Date(),
        };

        const result = await propertiesCollection.insertOne(propertyData);
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to add property" });
      }
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
