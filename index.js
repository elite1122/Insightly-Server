require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@elite.i866s.mongodb.net/?retryWrites=true&w=majority&appName=Elite`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();

        const userCollection = client.db("insightlyDB").collection("users");
        const articleCollection = client.db("insightlyDB").collection("articles");
        const publisherCollection = client.db("insightlyDB").collection("publishers");

        // Users related API
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        // Fetch user by email
        app.get('/users/:email', async (req, res) => {
            const email = req.params.email;
            try {
                const user = await userCollection.findOne({ email: email });
                if (!user) {
                    return res.status(404).send({ message: "User not found" });
                }
                res.send(user);  // Return the user data
            } catch (error) {
                console.error("Error fetching user:", error);
                res.status(500).send({ message: "Internal server error" });
            }
        });

         // Update subscription or user details using _id
         app.patch('/users/:id', async (req, res) => {
            const id = req.params.id;
            const { premiumTaken, name, photo } = req.body;

            try {
                const filter = { _id: new ObjectId(id) };
                const updateFields = {};
                
                if (premiumTaken) updateFields.premiumTaken = new Date(premiumTaken);
                if (name) updateFields.name = name;
                if (photo) updateFields.photo = photo;

                const result = await userCollection.updateOne(filter, { $set: updateFields });
                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "User not found" });
                }
                res.send({ message: "User updated successfully", updatedFields: updateFields });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to update user" });
            }
        });

        // Check subscription status
        app.get('/users/subscription/:id', async (req, res) => {
            const id = req.params.id;

            try {
                const user = await userCollection.findOne({ _id: new ObjectId(id) });
                if (!user) {
                    return res.status(404).send({ message: "User not found" });
                }

                const currentDate = new Date();
                const isPremium = user.premiumTaken && new Date(user.premiumTaken) > currentDate;
                res.send({ isPremium, premiumTaken: user.premiumTaken });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to check subscription" });
            }
        });


        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        });

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: { role: 'admin' }
            };
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        });

        // Get all approved articles with search and filter functionality
        app.get("/articles", async (req, res) => {
            try {
                const { search, publisher, tags, status, userEmail } = req.query;
                let query = {};

                if (status === "approved") {
                    query.isApproved = true;
                } else if (status === "pending") {
                    query.isApproved = false;
                    query.isDeclined = false;
                } else if (status === "declined") {
                    query.isDeclined = true;
                }

                if (search) {
                    query.title = { $regex: search, $options: "i" };
                }

                if (publisher) {
                    query.publisher = publisher;
                }

                if (tags) {
                    query.tags = { $in: tags.split(",") };
                }

                if (userEmail) {
                    query.authorEmail = userEmail;
                }

                const articles = await articleCollection.find(query).toArray();
                res.send(articles);
            } catch (error) {
                res.status(500).send({ message: "Error fetching articles", error });
            }
        });

        app.get("/articles/:id", async (req, res) => {
            const id = req.params.id;
            try {
                const articles = await articleCollection.findOne({ _id: new ObjectId(id) });
                if (!articles) {
                    return res.status(404).send({ message: "Article not found." });
                }

                // Increment view count by 1 when article is accessed
                await articleCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $inc: { views: 1 } }
                );

                res.send(articles);
            } catch (error) {
                res.status(500).send({ message: "Internal Server Error." });
            }
        });

        // Get decline reason
        app.get("/articles/decline-reason/:id", async (req, res) => {
            const id = req.params.id;
            const article = await articleCollection.findOne(
                { _id: new ObjectId(id) },
                { projection: { declineReason: 1 } }
            );
            res.send(article);
        });

        // Add an article
        app.post("/articles", async (req, res) => {
            const article = req.body;
            const result = await articleCollection.insertOne(article);
            res.send(result);
        });

        app.patch("/articles/approve/:id", async (req, res) => {
            const id = req.params.id;
            const result = await articleCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { isApproved: true, declineReason: null } }
            );
            res.send(result);
        });

        app.patch("/articles/decline/:id", async (req, res) => {
            const id = req.params.id;
            const { reason } = req.body;
            const result = await articleCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { isApproved: false, isDeclined: true, declineReason: reason } }
            );
            res.send(result);
        });

        app.patch("/articles/update/:id", async (req, res) => {
            const id = req.params.id;
            const { title, image, publisher, description, tags } = req.body;

            // Validation
            if (!title || !description || !publisher || !tags || !Array.isArray(tags)) {
                return res.status(400).send({ message: "Invalid data. All fields are required." });
            }

            try {
                // Check if the publisher exists
                const publisherExists = await publisherCollection.findOne({ name: publisher });
                if (!publisherExists) {
                    return res.status(404).send({ message: "Publisher not found." });
                }

                // Update article
                const updatedArticle = {
                    title,
                    image,
                    publisher,
                    description,
                    tags,
                };

                const result = await articleCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedArticle }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).send({ message: "Article not found." });
                }

                res.send({ message: "Article updated successfully." });
            } catch (error) {
                console.error("Error updating article:", error);
                res.status(500).send({ message: "Internal Server Error." });
            }
        });


        app.delete("/articles/:id", async (req, res) => {
            const id = req.params.id;
            const result = await articleCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        app.patch("/articles/premium/:id", async (req, res) => {
            const id = req.params.id;
            const result = await articleCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { isPremium: true } }
            );
            res.send(result);
        });

        // Publisher related APIs
        app.post("/publishers", async (req, res) => {
            const publisher = req.body;
            const result = await publisherCollection.insertOne(publisher);
            res.send(result);
        });

        app.get("/publishers", async (req, res) => {
            const publishers = await publisherCollection.find().toArray();
            res.send(publishers);
        });
    } finally {
        // Ensure client will close when finished
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Insightly is running');
});

app.listen(port, () => {
    console.log(`Insightly is running on port: ${port}`);
});
