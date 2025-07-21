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
const upload = multerUpload.fields([{ name: "mainImage", maxCount: 1 }]);

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
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

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
    const wishlistCollection = database.collection("wishlist");
    const reviewsCollection = database.collection("reviews");

    // verifyFB Token

    const verifyFBToken = async (req, res, next) => {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).send("Unauthorized");

      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;

        // 🔥 Fetch the user from your users collection
        const user = await usersCollection.findOne({ email: decoded.email });
        if (!user) {
          return res.status(404).json({ message: "User not found in DB" });
        }

        req.user = user;
        next();
      } catch (err) {
        res.status(403).send("Forbidden");
      }
    };

    // verify admin
    // Middleware to verify admin
    function verifyAdmin(req, res, next) {
      // Example: get user role from req.user (set by your auth middleware)
      // This depends on your auth setup, adjust accordingly
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized: No user info" });
      }

      if (user.role !== "admin") {
        return res.status(403).json({ message: "Forbidden: Admins only" });
      }

      next();
    }

    // verify agent

    function verifyAgent(req, res, next) {
      // Example: get user role from req.user (set by your auth middleware)
      // This depends on your auth setup, adjust accordingly
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized: No user info" });
      }

      if (user.role !== "agent") {
        return res.status(403).json({ message: "Forbidden: Admins only" });
      }

      next();
    }

    // verify user

    function verifyUser(req, res, next) {
      // Example: get user role from req.user (set by your auth middleware)
      // This depends on your auth setup, adjust accordingly
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Unauthorized: No user info" });
      }

      if (user.role !== "user") {
        return res.status(403).json({ message: "Forbidden: Admins only" });
      }

      next();
    }

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
          image: user.image,
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
    app.post(
      "/properties",
      verifyFBToken,
      verifyAgent,
      upload,
      async (req, res) => {
        try {
          const {
            title,
            location,
            basePrice,
            maxPrice,
            agentName,
            agentEmail,
          } = req.body;

          const mainImage = req.files["mainImage"]?.[0]?.buffer;

          const propertyData = {
            title,
            location,
            basePrice: Number(basePrice),
            maxPrice: Number(maxPrice),
            agentName,
            agentEmail,
            mainImage,
            verificationStatus: "pending", // Add default verificationStatus
            saleStatus: "available", // Add default saleStatus
            createdAt: new Date(),
          };

          const result = await propertiesCollection.insertOne(propertyData);
          res.send(result);
        } catch (error) {
          console.error(error);
          res.status(500).send({ error: "Failed to add property" });
        }
      }
    );

    // app.get("/properties", async (req, res) => {
    //   try {
    //     const properties = await propertiesCollection.find({}).toArray();
    //     res.status(200).json(properties);
    //   } catch (error) {
    //     console.error("Error fetching properties:", error);
    //     res.status(500).json({ message: "Server error fetching properties" });
    //   }
    // });

    //  get properties
    app.get("/properties", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const properties = await propertiesCollection
          .aggregate([
            {
              $lookup: {
                from: "agents",
                localField: "agentEmail",
                foreignField: "email",
                as: "agentInfo",
              },
            },
            {
              $unwind: { path: "$agentInfo", preserveNullAndEmptyArrays: true },
            },

            // Now lookup usersCollection to get agent image
            {
              $lookup: {
                from: "users",
                localField: "agentInfo.email",
                foreignField: "email",
                as: "userInfo",
              },
            },
            {
              $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true },
            },

            {
              $project: {
                title: 1,
                location: 1,
                basePrice: 1,
                maxPrice: 1,
                verificationStatus: 1,
                saleStatus: 1,
                createdAt: 1,

                agentName: { $ifNull: ["$agentInfo.name", "$agentName"] },
                agentEmail: { $ifNull: ["$agentInfo.email", "$agentEmail"] },
                agentPhoto: "$userInfo.image", // agent's image from users collection
              },
            },
          ])
          .toArray();

        res.status(200).json(properties);
      } catch (error) {
        console.error(
          "Error fetching properties with agent and user info:",
          error
        );
        res.status(500).json({ message: "Server error fetching properties" });
      }
    });

    // 🛡️ Protected Route: Get properties added by the logged-in agent
    // app.get("/my-properties", verifyFBToken, async (req, res) => {
    //   try {
    //     const email = req.decoded.email; // 👈 Comes from Firebase Auth token

    //     // 1. Get the agent's image from usersCollection
    //     const user = await usersCollection.findOne({ email });

    //     if (!user) {
    //       return res.status(404).send({ message: "Agent not found" });
    //     }

    //     const agentImage = user.photoURL || user.image || null;

    //     // 2. Get all properties added by this agent
    //     const agentProperties = await propertiesCollection
    //       .find({ agentEmail: email })
    //       .toArray();

    //     // 3. Attach agent image to each property
    //     const propertiesWithImage = agentProperties.map((property) => ({
    //       ...property,
    //       agentPhoto: agentImage, // add the image from user collection
    //     }));

    //     res.send(propertiesWithImage);
    //   } catch (err) {
    //     console.error("Error in /my-properties:", err);
    //     res.status(500).send({ error: "Something went wrong" });
    //   }
    // });

    // GET /my-properties : Return properties added by logged-in agent
    app.get("/my-properties", verifyFBToken, verifyAgent, async (req, res) => {
      try {
        // Get agent email from Firebase decoded token
        const agentEmail = req.decoded.email;

        if (!agentEmail) {
          return res.status(400).json({ message: "Email not found in token" });
        }

        // Fetch properties added by this agent with agent info lookup
        const properties = await propertiesCollection
          .aggregate([
            {
              $match: { agentEmail: agentEmail }, // only this agent's properties
            },
            {
              $lookup: {
                from: "agents",
                localField: "agentEmail",
                foreignField: "email",
                as: "agentInfo",
              },
            },
            {
              $unwind: { path: "$agentInfo", preserveNullAndEmptyArrays: true },
            },
            {
              $lookup: {
                from: "users",
                localField: "agentInfo.email",
                foreignField: "email",
                as: "userInfo",
              },
            },
            {
              $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                title: 1,
                location: 1,
                basePrice: 1,
                maxPrice: 1,
                verificationStatus: 1,
                saleStatus: 1,
                createdAt: 1,
                mainImage: 1, // Important: keep the buffer here

                agentName: { $ifNull: ["$agentInfo.name", "$agentName"] },
                agentEmail: { $ifNull: ["$agentInfo.email", "$agentEmail"] },
                agentPhoto: "$userInfo.image", // agent image URL or path
              },
            },
          ])
          .toArray();

        // Convert property mainImage from Buffer to base64 data URL for frontend
        const propertiesWithImages = properties.map((prop) => ({
          ...prop,
          mainImage: prop.mainImage
            ? `data:image/jpeg;base64,${prop.mainImage.toString("base64")}`
            : null,
        }));

        res.status(200).json(propertiesWithImages);
      } catch (error) {
        console.error("Error fetching agent properties:", error);
        res.status(500).json({ message: "Server error fetching properties" });
      }
    });

    // GET one property
    app.get("/properties/:id", async (req, res) => {
      const id = new ObjectId(req.params.id);
      const result = await propertiesCollection.findOne({ _id: id });
      res.send(result);
    });

    // PATCH (update) property
    app.patch("/properties/:id", async (req, res) => {
      const id = new ObjectId(req.params.id);
      const updateDoc = {
        $set: {
          title: req.body.title,
          location: req.body.location,
          basePrice: req.body.basePrice,
          maxPrice: req.body.maxPrice,
        },
      };
      const result = await propertiesCollection.updateOne(
        { _id: id },
        updateDoc
      );
      res.send(result);
    });

    // DELETE /properties/:id
    app.delete(
      "/properties/:id",
      verifyFBToken,
      verifyAgent,
      async (req, res) => {
        const id = req.params.id;

        try {
          const result = await propertiesCollection.deleteOne({
            _id: new ObjectId(id),
            agentEmail: req.user.email,
          });

          if (result.deletedCount > 0) {
            return res.status(200).json({ message: "Property deleted" });
          } else {
            return res
              .status(404)
              .json({ message: "Not found or unauthorized" });
          }
        } catch (err) {
          res
            .status(500)
            .json({ message: "Delete failed", error: err.message });
        }
      }
    );

    // PATCH /properties/verify/:id
    app.patch("/properties/verify/:id", async (req, res) => {
      const propertyId = req.params.id;
      const { status } = req.body; // should be either 'approved' or 'rejected'

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid verification status" });
      }

      const result = await propertiesCollection.updateOne(
        { _id: new ObjectId(propertyId) },
        { $set: { verificationStatus: status } }
      );

      res.send(result);
    });

    // Get all verified properties (for all users)
    app.get("/all-properties", verifyFBToken, async (req, res) => {
      try {
        const properties = await propertiesCollection
          .aggregate([
            {
              $match: { verificationStatus: "approved" }, // only approved properties
            },
            {
              $lookup: {
                from: "users",
                localField: "agentEmail",
                foreignField: "email",
                as: "agentInfo",
              },
            },
            {
              $unwind: "$agentInfo",
            },
            {
              $project: {
                title: 1,
                location: 1,
                verificationStatus: 1,
                basePrice: 1,
                maxPrice: 1,
                mainImage: 1,
                agentName: "$agentInfo.name",
                agentPhoto: "$agentInfo.image",
              },
            },
          ])
          .toArray();

        const propertiesWithImages = properties.map((prop) => ({
          ...prop,
          mainImage: prop.mainImage
            ? `data:image/jpeg;base64,${prop.mainImage.toString("base64")}`
            : null,
        }));

        res.send(propertiesWithImages);
      } catch (error) {
        console.error("Error in /all-properties:", error);
        res.status(500).send("Server error");
      }
    });

    // get property by id fro users

    app.get("/properties/details/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const property = await propertiesCollection
          .aggregate([
            {
              $match: {
                _id: new ObjectId(id),
                verificationStatus: "approved",
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "agentEmail",
                foreignField: "email",
                as: "agentInfo",
              },
            },
            {
              $unwind: "$agentInfo",
            },
          ])
          .toArray();

        if (!property || property.length === 0) {
          return res.status(404).json({ message: "Property not found" });
        }

        const prop = property[0];

        const formatted = {
          ...prop,
          mainImage: prop.mainImage
            ? `data:image/jpeg;base64,${prop.mainImage.toString("base64")}`
            : null,
          agentImage: prop.agentInfo?.image || "",
          agentName: prop.agentInfo?.name || "",
        };

        res.json(formatted);
      } catch (error) {
        res.status(500).json({ message: "Server error", error });
      }
    });

    // post all reviews
    app.post("/reviews", async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    // get property review by property id

    app.get("/reviews/:propertyId", async (req, res) => {
      const propertyId = req.params.propertyId;
      const result = await reviewsCollection
        .find({ propertyId: propertyId })
        .sort({ createdAt: -1 }) // latest first
        .toArray();
      res.send(result);
    });

    // add wishlist

    app.post("/wishlist", async (req, res) => {
      const wishlistItem = req.body;

      const existing = await wishlistCollection.findOne({
        userEmail: wishlistItem.userEmail,
        propertyId: wishlistItem.propertyId,
      });

      if (existing) {
        return res.status(409).send({ message: "Already in wishlist" });
      }

      const result = await wishlistCollection.insertOne(wishlistItem);
      res.send(result);
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
