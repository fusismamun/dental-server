const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECREAT_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bne63at.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctor_service').collection('servicesinfo');
        const bookingCollection = client.db('doctor_service').collection('bookings');
        const userCollection = client.db('doctor_service').collection('users');
        const paymentCollection = client.db('doctor_service').collection('payments');

        app.post('/create-payment-intent', async(req,res) => {
            const service = req.body;
            const price = service.price;
            const amount = price*100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
              });
              res.send({clientSecret: paymentIntent.client_secret})

        });

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        });



        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        app.put('/user/admin/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            
            const updateDoc = {
                $set: {role: 'admin'},
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send({ resultn });
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET)
            res.send({ result, token });
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // step : 1 get all services
            const services = await serviceCollection.find().toArray();

            // step: 2 get the booking of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3 : for each services, find booking for the services
            services.forEach(service => {
                const serviceBooking = bookings.filter(b => b.treatment === service.name);
                const booked = serviceBooking.map(b => b.slot );
                const available = service.slots.filter(slot => !booked.includes(slot));
                service.slots = available;
            });


            res.send(services);
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }

        })

        app.get('/booking/:id', async(req,res)=> {
            const id = req.params.id;
            const query ={_id: ObjectId(id)};
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        });

        app.patch('/booking/:id', async(res,req)=> {
            const id = req.params.id;
            const payment = req.body;
            const filter = {_id: ObjectId(id)};
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updateDoc);
            res.send(updateDoc);
        })

    }
    finally {
    }

}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello from doctor dental')
})

app.listen(port, (req, res) => {
    console.log(`doctor dental running on port ${port}`)
})