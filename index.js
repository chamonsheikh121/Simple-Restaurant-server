const express = require('express')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors')
const jwt = require('jsonwebtoken')
const app = express()
const formData = require('form-data');
const Mailgun = require('mailgun.js')
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
    username: 'api',
    key: process.env.MAIL_GUN_API_KEY
})
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = 5000;

// middlewares
app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_PASS}@cluster0.hxgtknm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

        // await client.connect();

        const Mongo = client.db('Birstro-Boss')
        const menuCollection = Mongo.collection("menu")
        const reviewCollection = Mongo.collection('reviews')
        const cartCollection = Mongo.collection('carts')
        const userCollection = Mongo.collection('users')
        const paymentCollection = Mongo.collection('payments')

        // user related apis

        app.post('/api/v1/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.SECRET_KEY, { expiresIn: '6h' });
            // console.log(token);
            res.send(token)
        })

        // verify and access
        const verifyToken = (req, res, next) => {
            // console.log(req.headers.authorization);
            // console.log(res.decoded);
            const reqToken = req.headers.authentication;
            // console.log(reqToken);
            if (!reqToken) {
                return res.status(401).send({ message: 'unauthorized user' })
            }
            const token = reqToken.split(' ')[1]
            // console.log(token);
            jwt.verify(token, process.env.SECRET_KEY, (err, decode) => {
                if (err) {
                    res.status(401).send({ message: 'unauthorized user' })
                }
                res.decoded = decode
                // console.log(decode);
                next()
            })

        }
        const verifyAdmin = async (req, res, next) => {

            try {
                const email = res.decoded.email
                // console.log(email)
                const filter = { email: email };
                const user = await userCollection.findOne(filter);
                const admin = user?.userRole === 'admin';
                if (!admin) {
                    return res.status(403).send({ message: 'forbidden access' })
                }
                next()
            }
            catch (error) {
                console.log(error);
            }
        }


        app.get('/api/v1/admin', verifyToken, async (req, res) => {
            const email = req.query.email;

            if (email !== res.decoded?.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const filter = { email: email };
            const user = await userCollection.findOne(filter);
            let isAdmin = false;
            if (user?.userRole === 'admin') {
                isAdmin = true
            }

            res.send({ isAdmin })

        })
        app.post('/api/v1/users', async (req, res) => {
            try {

                const user = req.body;
                const query = { email: user?.email }
                const existingUser = await userCollection.findOne(query)
                if (existingUser) {
                    return res.send({ message: "user already exist", insertedId: null })
                }
                const result = await userCollection.insertOne(user);
                res.send(result);
            }
            catch (error) {
                console.log(error);
            }
        })
        app.get('/api/v1/users', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const cursor = await userCollection.find().toArray();
                res.send(cursor)
            }
            catch (error) {
                console.log(error);
            }
        })
        app.delete('/api/v1/users/:id', verifyToken, verifyAdmin, async (req, res) => {

            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result)
        })

        app.patch('/api/v1/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        userRole: 'admin'
                    }
                }
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result)
            }
            catch (error) {
                console.log(error);
            }
        })

        app.post('/api/v1/menu', verifyToken, verifyAdmin, async (req, res) => {
            const recipe = req.body;
            const result = await menuCollection.insertOne(recipe);
            res.send(result)
        })


        app.get('/api/v1/menu', async (req, res) => {
            const cursor = await menuCollection.find().toArray();
            res.send(cursor)
        })
        app.get('/api/v1/menuItem/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) };
                const result = await menuCollection.findOne(filter);
                res.send(result)

            }
            catch (error) {
                console.log(error);
            }
        })

        app.patch('/api/v1/menu/update-item/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const menuItem = req.body;
            // console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    name: menuItem?.name,
                    recipe: menuItem?.recipe,
                    image: menuItem?.image,
                    category: menuItem?.category,
                    price: menuItem?.price,

                }
            }
            // console.log(updateDoc);
            const result = await menuCollection.updateOne(filter, updateDoc);
            res.send(result)
        })

        app.delete('/api/v1/menuItem/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(filter);
            res.send(result);
        })


        app.get('/api/v1/reviews',  async (req, res) => {
            const cursor = await reviewCollection.find().toArray();
            // console.log(cursor);
            res.send(cursor)
        })
        app.post('/api/v1/cartItems', async (req, res) => {

            const body = req.body;
            const result = await cartCollection.insertOne(body);
            res.send(result)
        })
        app.get('/api/v1/cartItems', async (req, res) => {
            const email = req.query.email
            // console.log(email);
            const query = { CustomerEmail: email }
            // console.log(query);
            const result = await cartCollection.find(query).toArray()
            res.send(result)
        })

        app.delete('/api/v1/cartItems/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            console.log(query);
            const result = await cartCollection.deleteOne(query);
            res.send(result)
        })

        // payments intent
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price) * 100;
            // console.log(amount);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: [
                    'card'
                ]
            })
            // console.log(paymentIntent.client_secret);
            res.send({ client_secret: paymentIntent.client_secret })

        })
        app.get('/api/v1/orders-payments/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await paymentCollection.find(filter).toArray();
            res.send(result)
        })
        app.post('/api/v1/orders-payments', async (req, res) => {
            const orderDetails = req.body;
            // console.log(orderDetails);
            const paymentResult = await paymentCollection.insertOne(orderDetails)
            // delete form cart
            const filter = {
                _id: {
                    $in: orderDetails.cartIds.map(id => ObjectId.createFromHexString(id))
                }
            };
            console.log(req.body);
            const cartDeletedResult = await cartCollection.deleteMany(filter);
            const body = { paymentCollection, cartCollection }
            res.send({ paymentResult, cartDeletedResult })
        })


        // stats or analytics
        app.get('/api/v1/admin-stats', verifyToken, verifyAdmin, async (req, res) => {

            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();
            const users = await userCollection.estimatedDocumentCount();

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$totalPrice' }
                    }
                }
            ]).toArray();

            const revenue = result.length > 0 ? result[0].totalRevenue : 0;

            res.send({
                users,
                menuItems,
                orders,
                revenue
            })
        })

        // app.get('/api/v1/orders-stats', async (req, res) => {
        //     const result = await paymentCollection.aggregate([
        //         {
        //             $unwind: "$menuId"
        //         },
        //         {
        //             $lookup: {
        //                 from: "menu",
        //                 localField: "menuId",
        //                 foreignField: "_id",
        //                 as: "menuDetails"
        //             }
        //         }
        //         // ,
        //         // {
        //         //     $unwind:"$menuDetails"
        //         // }
        //     ]).toArray()
        //     res.send(result)
        // })



        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {

        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})