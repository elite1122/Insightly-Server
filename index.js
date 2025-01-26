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

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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


        // users related api
        app.get('/users', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;

            // if (email !== req.decoded.email) {
            //   return res.status(403).send({ message: 'forbidden access' })
            // }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            // insert email if user doesn't exists
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.delete('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })


        // Get all approved articles with search and filter functionality
        app.get("/articles", async (req, res) => {
            try {
                const { search, publisher, tags, status } = req.query;
                let query = {};  
        
                // If status is "approved", filter only approved articles
                if (status === "approved") {
                    query.isApproved = true;
                }
        
                // Search by title (case-insensitive)
                if (search) {
                    query.title = { $regex: search, $options: "i" };
                }
        
                // Filter by publisher
                if (publisher) {
                    query.publisher = publisher;
                }
        
                // Filter by tags (tags should be an array)
                if (tags) {
                    query.tags = { $in: tags.split(",") };
                }
        
                const articles = await articleCollection.find(query).toArray();
                res.send(articles);
            } catch (error) {
                res.status(500).send({ message: "Error fetching articles", error });
            }
        });
        


        //add an article
        app.post("/articles", async (req, res) => {
            const article = req.body;
            const result = await articleCollection.insertOne(article);
            res.send(result);
        });

        // Approve an article
        app.patch("/articles/approve/:id", async (req, res) => {
            const id = req.params.id;
            const result = await articleCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { isApproved: true } }
            );
            res.send(result);
        });

        // Decline an article with reason
        app.patch("/articles/decline/:id", async (req, res) => {
            const id = req.params.id;
            const { reason } = req.body;
            const result = await articleCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { isApproved: false, declineReason: reason } }
            );
            res.send(result);
        });

        // Delete an article
        app.delete("/articles/:id", async (req, res) => {
            const id = req.params.id;
            const result = await articleCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // Mark an article as premium
        app.patch("/articles/premium/:id", async (req, res) => {
            const id = req.params.id;
            const result = await articleCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { isPremium: true } }
            );
            res.send(result);
        });


        // Publisher related apis
        app.post("/publishers", async (req, res) => {
            const publisher = req.body;
            const result = await publisherCollection.insertOne(publisher);
            res.send(result);
        });

        app.get("/publishers", async (req, res) => {
            const publishers = await publisherCollection.find().toArray();
            res.send(publishers);
        });











        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Insightly is running')
});

app.listen(port, () => {
    console.log(`Insightly is running on port: ${port}`)
});