const dotenv = require("dotenv");

dotenv.config();
const express = require("express");
const cors = require("cors");

const multer = require("multer");

// require("dotenv").config();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Multer setup
const storage = multer.memoryStorage();
const multerUpload = multer({ storage }); // Call multer() properly
const upload = multerUpload.fields([{ name: "mainImage", maxCount: 1 }]);

var admin = require("firebase-admin");

// console.log("value going to Buffer.from():");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);

var serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(
  cors({
    origin: "https://real-estate-8f8a4-e2699.web.app", // frontend URL
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
    // await client.connect();

    // MongoDB connected etc...
    await connectToDB();

    // ✅ এখন call করো, আগে কখনো না
    await addAdvertisedField();

    //   console.log("mongodb connected");
    const database = client.db("realestate");

    const usersCollection = database.collection("users");
    const adminsCollection = database.collection("admins");
    const agentsCollection = database.collection("agents");

    const propertiesCollection = database.collection("properties");
    const wishlistCollection = database.collection("wishlist");
    const reviewsCollection = database.collection("reviews");
    const offersCollection = database.collection("offers");
    // const purchasedCollection = database.collection("purcahses");

    // verifyFB Token

    const verifyFBToken = async (req, res, next) => {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).send("Unauthorized");
      // console.log(token);

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
        return res.status(403).json({ message: "Forbidden: users only" });
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
    app.get("/users/:email", async (req, res) => {
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

    // fraud

    app.patch("/users/mark-fraud/:id", async (req, res) => {
      const { id } = req.params;

      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user || user.role !== "agent") {
        return res
          .status(400)
          .send({ message: "Only agents can be marked as fraud." });
      }

      // 1. Update role to fraud
      await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: "fraud" } }
      );

      // 2. Remove all properties added by this agent
      const deleted = await propertiesCollection.deleteMany({
        agentEmail: user.email,
      });

      res.send({
        message: "Agent marked as fraud",
        propertiesRemoved: deleted.deletedCount,
      });
    });

    // get agent

    app.get("/agents", async (req, res) => {
      try {
        const agents = await agentsCollection.find().toArray();
        res.send(agents);
      } catch (err) {
        console.error("Failed to fetch agents:", err);
        res.status(500).send({ message: "Internal Server Error" });
      }
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
    app.delete("/users/:id", verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user) return res.status(404).send({ message: "User not found" });
      // console.log("Received DELETE request for ID:", req.params.id);

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

    // for advertise

    // PUT: Update property as advertised
    app.put(
      "/properties/advertise/:id",
      verifyFBToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await propertiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { advertised: true } }
        );
        console.log("Advertise update result:", result);

        res.send(result);
      }
    );

    // get advertised data

    app.get("/properties/advertised", async (req, res) => {
      const properties = await propertiesCollection
        .find({ advertised: true, verificationStatus: "approved" }) // <-- filter here
        .limit(6)
        .toArray();

      // Convert binary to base64 string
      const updated = properties.map((property) => {
        if (property.mainImage && property.mainImage.buffer) {
          const base64Image = property.mainImage.buffer.toString("base64");
          property.mainImage = `data:image/jpeg;base64,${base64Image}`;
        }
        return property;
      });

      res.send(updated);
    });

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

    app.get("/properties/:id", verifyFBToken, async (req, res) => {
      const id = new ObjectId(req.params.id);
      const result = await propertiesCollection.findOne({ _id: id });
      console.log("Property fetched:", result); // add this debug line
      res.send(result);
    });

    // PATCH (update) property
    app.patch(
      "/properties/:id",
      verifyFBToken,
      verifyAgent,
      async (req, res) => {
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
      }
    );

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

    app.get(
      "/properties/details/:id",
      verifyFBToken,

      async (req, res) => {
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
      }
    );

    // post all reviews
    app.post("/reviews", verifyFBToken, async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    // get latest reviews

    // Server-side (Express)
    // In your Express backend
    app.get("/reviews/all", async (req, res) => {
      try {
        const allReviews = await reviewsCollection
          .find({})
          .sort({ reviewTime: -1 })
          .toArray();
        res.send(allReviews);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Failed to fetch all reviews", error: err });
      }
    });

    // get property review by property id

    app.get("/reviews/:propertyId", verifyFBToken, async (req, res) => {
      const propertyId = req.params.propertyId;
      const result = await reviewsCollection
        .find({ propertyId: propertyId })
        .sort({ createdAt: -1 }) // latest first
        .toArray();
      res.send(result);
    });

    // get all reviews for admin

    // Example: GET /reviews (admin only)
    app.get("/reviews", verifyFBToken, async (req, res) => {
      try {
        const result = await reviewsCollection.find().toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: "Error fetching reviews", error: err });
      }
    });

    // get review by user email

    // Example: GET /reviews/user/:email (user only)
    // const { ObjectId } = require("mongodb");

    app.get("/reviews/user/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "Unauthorized access" });
      }

      try {
        const result = await reviewsCollection
          .aggregate([
            {
              $match: { reviewerEmail: email },
            },
            {
              $addFields: {
                propertyObjId: {
                  $convert: {
                    input: "$propertyId",
                    to: "objectId",
                    onError: null,
                    onNull: null,
                  },
                },
              },
            },
            {
              $lookup: {
                from: "properties",
                localField: "propertyObjId",
                foreignField: "_id",
                as: "propertyData",
              },
            },
            {
              $unwind: {
                path: "$propertyData",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                comment: 1,
                propertyTitle: 1,
                reviewTime: 1,
                agentName: "$propertyData.agentName",
              },
            },
          ])
          .toArray();

        res.send(result);
      } catch (err) {
        res
          .status(500)
          .send({ message: "Error joining review with property", error: err });
      }
    });

    // delete revieww

    // DELETE a review by ID (User only)
    app.delete("/reviews/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;

      try {
        const result = await reviewsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount > 0) {
          res.send({ success: true, message: "Review deleted successfully" });
        } else {
          res.status(404).send({ success: false, message: "Review not found" });
        }
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Error deleting review",
          error: err,
        });
      }
    });

    // add wishlist

    app.post("/wishlist", verifyFBToken, verifyUser, async (req, res) => {
      const wishlistItem = req.body;

      // Check duplicate
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

    // GET wishlist by user email
    app.get("/wishlist", verifyFBToken, verifyUser, async (req, res) => {
      try {
        const email = req.decoded.email; // safer to use token email

        const wishlistItems = await wishlistCollection
          .find({ userEmail: email })
          .toArray();

        const enrichedWishlist = await Promise.all(
          wishlistItems.map(async (item) => {
            const property = await propertiesCollection.findOne({
              _id: new ObjectId(item.propertyId),
            });
            if (!property) return null;

            const agent = await usersCollection.findOne({
              email: property.agentEmail,
            });

            return {
              _id: item._id,
              propertyId: item.propertyId,
              propertyImage: property.mainImage
                ? `data:image/webp;base64,${property.mainImage.toString(
                    "base64"
                  )}`
                : null,
              title: property.title,
              location: property.location,
              priceRange: `${property.basePrice} - ${property.maxPrice}`,
              verificationStatus: property.verificationStatus,
              agentName: agent?.name || "Unknown",
              agentImage: agent?.image || "",
            };
          })
        );

        // In your Express backend
        app.delete(
          "/wishlist/:id",
          verifyFBToken,
          verifyUser,
          async (req, res) => {
            const id = req.params.id;

            try {
              const result = await wishlistCollection.deleteOne({
                _id: new ObjectId(id),
              });

              if (result.deletedCount > 0) {
                return res
                  .status(200)
                  .json({ message: "Wishlist item removed" });
              } else {
                return res.status(404).json({ message: "Item not found" });
              }
            } catch (error) {
              console.error(error);
              res
                .status(500)
                .json({ message: "Failed to remove wishlist item" });
            }
          }
        );

        // 🛡️ User must be logged in (buyer making offer)
        app.post("/offers", verifyFBToken, verifyUser, async (req, res) => {
          try {
            const {
              propertyId,
              offerAmount,
              buyingDate, // ISO string or yyyy-mm-dd
            } = req.body;

            if (!propertyId || !offerAmount || !buyingDate) {
              return res
                .status(400)
                .json({ message: "Missing required fields." });
            }

            // Lookup property
            const property = await propertiesCollection.findOne({
              _id: new ObjectId(propertyId),
            });

            if (!property) {
              return res.status(404).json({ message: "Property not found." });
            }

            // Optional: Only allow offers on approved properties
            if (property.verificationStatus !== "approved") {
              return res.status(403).json({
                message: "Offers allowed only on approved properties.",
              });
            }

            // Validate amount using numeric fields actually stored in DB
            const min = Number(property.basePrice);
            const max = Number(property.maxPrice);
            const amountNum = Number(offerAmount);

            if (Number.isNaN(amountNum)) {
              return res
                .status(400)
                .json({ message: "Offer amount must be a number." });
            }
            if (amountNum < min || amountNum > max) {
              return res
                .status(400)
                .json({ message: `Offer must be between ${min} and ${max}.` });
            }

            // Grab buyer info from verified token (trust server, not client)
            const buyerEmail = req.decoded.email;
            const buyerUser = await usersCollection.findOne({
              email: buyerEmail,
            });

            // ✅ Before inserting new offer
            const existingOffer = await offersCollection.findOne({
              propertyId,
              buyerEmail,
            });

            if (existingOffer) {
              return res.status(409).json({
                message: "You have already made an offer for this property.",
              });
            }

            // Build safe doc
            const offerDoc = {
              propertyId,
              propertyTitle: property.title,
              propertyLocation: property.location,
              agentEmail: property.agentEmail,
              agentName: property.agentName ?? null, // fallback if not stored
              offerAmount: amountNum,
              buyerEmail,
              buyerName:
                buyerUser?.name || buyerUser?.displayName || buyerEmail,
              buyingDate: new Date(buyingDate), // store as Date
              status: "pending", // default
              createdAt: new Date(),
            };

            const result = await offersCollection.insertOne(offerDoc);
            return res
              .status(201)
              .json({ insertedId: result.insertedId, ...offerDoc });
          } catch (err) {
            console.error("Offer creation error:", err);
            res
              .status(500)
              .json({ message: "Server error while posting offer." });
          }
        });

        res.send(enrichedWishlist.filter(Boolean));
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch wishlist" });
      }
    });

    // get property offered for users

    app.get(
      "/offers/user/:email",
      verifyFBToken,
      verifyUser,
      async (req, res) => {
        const email = req.params.email;
        try {
          const offers = await offersCollection
            .find({ buyerEmail: email })
            .toArray();

          const results = await Promise.all(
            offers.map(async (offer) => {
              // console.log("Offer propertyId:", offer.propertyId);
              let propertyId;
              try {
                propertyId = new ObjectId(offer.propertyId);
              } catch (err) {
                console.error("Invalid ObjectId:", offer.propertyId);
                return null; // skip this offer
              }

              const property = await propertiesCollection.findOne({
                _id: new ObjectId(offer.propertyId),
              });
              // console.log("property found:", property);

              // ekhane boshabe

              if (!property) {
                console.warn("Property not found for id:", offer.propertyId);
              }

              const agent = await usersCollection.findOne({
                email: offer.agentEmail,
              });

              return {
                ...offer,
                propertyTitle: property?.title,
                propertyLocation: property?.location,
                propertyImage: property?.mainImage,
                agentName: agent?.name,
                agentImage: agent?.image,
              };
            })
          );

          // Remove nulls if any offers skipped
          res.send(results.filter(Boolean));
        } catch (err) {
          console.error(err);
          res.status(500).send({ message: "Error fetching offers" });
        }
      }
    );

    // GET /offers/check?propertyId=xyz
    app.get("/offers/check", verifyFBToken, async (req, res) => {
      const propertyId = req.query.propertyId;
      const buyerEmail = req.decoded.email;

      const exists = await offersCollection.findOne({
        propertyId,
        buyerEmail,
      });

      res.send({ exists: !!exists });
    });

    // GET all offers for a specific agent's properties
    app.get(
      "/offers/agent/:email",
      verifyFBToken,
      verifyAgent,
      async (req, res) => {
        const agentEmail = req.params.email;

        try {
          const properties = await propertiesCollection
            .find({ agentEmail: new RegExp(`^${agentEmail}$`, "i") })
            .project({ _id: 1, title: 1, location: 1 })
            .toArray();

          const stringIds = properties.map((p) => p._id.toString());

          if (stringIds.length === 0) {
            return res.send([]);
          }

          const offers = await offersCollection
            .find({ propertyId: { $in: stringIds } }) // <-- Ensure propertyId is stored as string
            .toArray();

          const enrichedOffers = offers.map((offer) => {
            const property = properties.find(
              (p) => p._id.toString() === offer.propertyId
            );
            return {
              ...offer,
              propertyTitle: property?.title,
              propertyLocation: property?.location,
            };
          });

          res.send(enrichedOffers);
        } catch (err) {
          console.error(err);
          res.status(500).send({ message: "Something went wrong" });
        }
      }
    );

    // for accept
    app.patch("/offers/accept/:id", async (req, res) => {
      const offerId = req.params.id;

      try {
        // 1. Find the offer
        const selectedOffer = await offersCollection.findOne({
          _id: new ObjectId(offerId),
        });

        if (!selectedOffer) {
          return res.status(404).send({ error: "Offer not found" });
        }

        const propertyId = selectedOffer.propertyId;

        // 2. Accept selected offer
        await offersCollection.updateOne(
          { _id: new ObjectId(offerId) },
          { $set: { status: "accepted" } }
        );

        // 3. Reject all other offers for same property
        await offersCollection.updateMany(
          {
            propertyId: propertyId,
            _id: { $ne: new ObjectId(offerId) },
          },
          { $set: { status: "rejected" } }
        );

        res.send({ message: "Offer accepted and others rejected." });
      } catch (err) {
        console.error("Error accepting offer:", err);
        res.status(500).send({ error: "Server error" });
      }
    });

    // for reject

    app.patch(
      "/offers/reject/:id",

      async (req, res) => {
        const offerId = req.params.id;

        try {
          const result = await offersCollection.updateOne(
            { _id: new ObjectId(offerId) },
            { $set: { status: "rejected" } }
          );

          res.send({ message: "Offer rejected" });
        } catch (err) {
          console.error("Error rejecting offer:", err);
          res.status(500).send({ error: "Server error" });
        }
      }
    );

    // get stripe post

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      const amount = price * 100; // Stripe expects amount in cents

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    app.get("/offers/:id", async (req, res) => {
      const offerId = req.params.id;
      try {
        const offer = await offersCollection.findOne({
          _id: new ObjectId(offerId),
        });
        if (!offer) return res.status(404).json({ message: "Offer not found" });
        res.json(offer);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });

    app.patch("/offers/payment-success/:id", async (req, res) => {
      const offerId = req.params.id;
      const { trxId, paymentStatus } = req.body;

      try {
        const offer = await offersCollection.findOne({
          _id: new ObjectId(offerId),
        });
        if (!offer) return res.status(404).json({ message: "Offer not found" });

        // Update offer status and save transaction ID
        await offersCollection.updateOne(
          { _id: new ObjectId(offerId) },
          { $set: { status: paymentStatus, transactionId: trxId } }
        );

        // Optional: Also update property status to "sold" to prevent further offers
        await propertiesCollection.updateOne(
          { _id: new ObjectId(offer.propertyId) },
          { $set: { status: "sold" } }
        );

        res.json({ message: "Payment success updated" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });

    // GET: /sold-properties/:agentEmail
    app.get("/sold-properties/:agentEmail", async (req, res) => {
      const agentEmail = req.params.agentEmail;

      try {
        // Step 1: Find all offers where status is "bought" and agentEmail matches
        const soldOffers = await offersCollection
          .find({
            agentEmail: agentEmail,
            status: "bought",
          })
          .toArray();

        if (soldOffers.length === 0) {
          return res.json([]);
        }

        // Step 2: Populate extra info from properties collection
        const propertyIds = soldOffers.map(
          (offer) => new ObjectId(offer.propertyId)
        );
        const properties = await propertiesCollection
          .find({ _id: { $in: propertyIds } })
          .toArray();

        // Step 3: Combine data and return
        const result = soldOffers.map((offer) => {
          const matchedProperty = properties.find(
            (prop) => prop._id.toString() === offer.propertyId
          );

          return {
            propertyTitle: matchedProperty?.title || "N/A",
            propertyLocation: matchedProperty?.location || "N/A",
            buyerEmail: offer.buyerEmail,
            buyerName: offer.buyerName,
            soldPrice: offer.offerAmount,
          };
        });

        res.json(result);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .json({ message: "Server error fetching sold properties" });
      }
    });

    // Route: GET /offers/property-status/:propertyId
    app.get("/offers/property-status/:propertyId", async (req, res) => {
      const propertyId = req.params.propertyId;
      const boughtOffer = await offersCollection.findOne({
        propertyId,
        status: "bought",
      });

      if (boughtOffer) {
        return res.send({ isBought: true });
      }
      res.send({ isBought: false });
    });

    console.log("✅ MongoDB connected and users collection ready");
  } catch (err) {
    console.error("Mongo error:", err);
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("🔥🔥🔥Real estate Is Cooking");
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
