require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const jwt = require('jsonwebtoken');
const app = express();
const cron = require("node-cron");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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

const userCollection = client.db("insightlyDB").collection("users");
const articleCollection = client.db("insightlyDB").collection("articles");
const publisherCollection = client.db("insightlyDB").collection("publishers");

async function run() {
    try {
        // await client.connect();

        // jwt related api
        // app.post('/jwt', async (req, res) => {
        //     const user = req.body;
        //     const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
        //     res.send({ token });
        // })

        // middlewares 
        // const verifyToken = (req, res, next) => {
        //     // console.log('inside verify token', req.headers.authorization);
        //     if (!req.headers.authorization) {
        //         return res.status(401).send({ message: 'unauthorized access' });
        //     }
        //     const token = req.headers.authorization.split(' ')[1];
        //     jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        //         if (err) {
        //             return res.status(401).send({ message: 'unauthorized access' })
        //         }
        //         req.decoded = decoded;
        //         next();
        //     })
        // }

        // use verify admin after verifyToken
        // const verifyAdmin = async (req, res, next) => {
        //     const email = req.decoded.email;
        //     const query = { email: email };
        //     const user = await userCollection.findOne(query);
        //     const isAdmin = user?.role === 'admin';
        //     if (!isAdmin) {
        //         return res.status(403).send({ message: 'forbidden access' });
        //     }
        //     next();
        // }


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

        // Update user profile endpoint
        app.patch("/users/:email", async (req, res) => {
            const email = req.params.email;
            const { name, photo, phone, address } = req.body;

            try {
                const filter = { email };
                const updateDoc = {
                    $set: {
                        ...(name && { name }),
                        ...(photo && { photo }),
                        ...(phone && { phone }),
                        ...(address && { address }),
                    },
                };

                const result = await userCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(404).json({ message: "User not found" });
                }

                if (result.modifiedCount === 1) {
                    res.status(200).json({ message: "Profile updated successfully" });
                } else {
                    res.status(200).json({ message: "No changes made to the profile" });
                }
            } catch (error) {
                console.error("Profile update error:", error);
                res.status(500).json({ message: "Internal server error" });
            }
        });

        // Update subscription or user details using _id
        app.patch('/users/:id', async (req, res) => {
            const id = req.params.id;
            const { premiumTaken, name, photo, role } = req.body;

            try {
                const filter = { _id: new ObjectId(id) };
                const updateFields = {};

                if (premiumTaken) updateFields.premiumTaken = new Date(premiumTaken);
                if (name) updateFields.name = name;
                if (photo) updateFields.photo = photo;
                if (role) updateFields.role = role;

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
                res.send({ isPremium, premiumTaken: user.premiumTaken, role: user.role });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to check subscription" });
            }
        });


        app.post("/create-payment-intent", async (req, res) => {
            const { amount } = req.body;

            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount, // Amount in cents
                    currency: "usd", // Change to your desired currency
                    payment_method_types: ["card"],
                });

                res.send({
                    clientSecret: paymentIntent.client_secret,
                });
            } catch (error) {
                console.error("Error creating payment intent:", error);
                res.status(500).send({ error: "Failed to create payment intent" });
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
                const { search, publisher, tags, status, email } = req.query;
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

                if (email) {
                    query.authorEmail = email;
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

        // Add an article with user restriction logic
        app.post("/articles", async (req, res) => {
            const { authorEmail, ...articleData } = req.body;

            try {
                // Fetch user details
                const user = await userCollection.findOne({ email: authorEmail });
                if (!user) {
                    return res.status(404).send({ message: "User not found" });
                }

                // Check if user is not premium and already has an article
                if (user.role !== "premium") {
                    const existingArticles = await articleCollection.countDocuments({ authorEmail });
                    if (existingArticles >= 1) {
                        return res.status(403).send({
                            message: "Normal users can only publish one article. Upgrade to premium to post more."
                        });
                    }
                }

                // Insert article into the collection
                const result = await articleCollection.insertOne({ authorEmail, ...articleData });
                res.send({ message: "Article published successfully", articleId: result.insertedId });
            } catch (error) {
                console.error("Error adding article:", error);
                res.status(500).send({ message: "Internal Server Error" });
            }
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

async function checkSubscriptions() {
    try {
        const currentDate = new Date();

        // Find users whose subscription has expired
        const expiredUsers = await userCollection.find({
            premiumTaken: { $lte: currentDate }, // Check if premiumTaken is less than or equal to current date
        }).toArray();

        if (expiredUsers.length > 0) {
            const expiredUserIds = expiredUsers.map(user => user._id);

            // Update role to 'user' and set premiumTaken to null for expired users
            const result = await userCollection.updateMany(
                { _id: { $in: expiredUserIds } },
                { $set: { role: "user", premiumTaken: null } }
            );

            console.log(`Updated ${result.modifiedCount} users to role "user".`);
        } else {
            // console.log("No expired subscriptions found.");
        }
    } catch (error) {
        console.error("Error checking subscriptions:", error);
    }
}

// Schedule the task to run every hour
cron.schedule("* * * * *", () => {
    // console.log("Checking for expired subscriptions...");
    checkSubscriptions();
});

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Insightly is running');
});

app.listen(port, () => {
    console.log(`Insightly is running on port: ${port}`);
});
