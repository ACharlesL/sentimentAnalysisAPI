const express = require('express');
const helmet = require('helmet');
const { MongoClient, ObjectID } = require('mongodb');
//const cors = require('cors')

const url = process.env.MONGO_URL || 'mongodb://localhost:27017/twtsnt';
const dbName = 'twtsnt';
let client = null;
const port = process.env.PORT || 3001;
const app = express();
// app.use(cors({ port: process.env.PORT || 3000 }))

// Get a database instance
async function getDB() {
    if (client && !client.isConnected) {
        client = null;
    }

    if (client === null) {
        client = new MongoClient(url, { useNewUrlParser: true });
    } else if (client && client.isConnected) {
        return client.db(dbName);
    }

    try {
        await client.connect();
        return client.db(dbName);
    } catch (err) {
        return err;
    }
}

// HTTP Security header middleware
app.use(helmet());

// Get score from the given keyword    i.e.) /api/score?keyword=bitcoin
app.get('/api/score', async (req, res) => {
    try {
        const db = await getDB();
        if (!req.query.keyword) {
            res.status(400).json({ message: 'missing keyword' });
        }

        const resp = {};
        const keyword = req.query.keyword;
        const collection = db.collection('calc');

        const data = await collection.findOne({ keyword });
        res.json({
            keyword,
            data,
        });
    } catch (err) {
        res.status(500).json({
            message: err.message,
        });
    }
});

// Get sentiment analysis tweets data
app.get('/api/tweets', async (req, res) => {
    try {
        const db = await getDB();
        if (!req.query.keyword) {
            res.status(400).json({ message: 'missing keyword' });
        }

        const resp = {};
        const keyword = req.query.keyword;
        let limit;
        if (!!req.query.limit) {
            req.query.limit = Number(req.query.limit);
        }
        // Get documents (limit 1 - 100)
        if (req.query.limit > 0 && req.query.limit <= 100) {
            limit = req.query.limit;
        } else {
            limit = 100;
        }
        resp.limit = limit;

        let collection = db.collection(`keyword_${keyword}`);

        const skip = req.query.skip;
        if (skip) {
            resp.skip = skip;
            // use MongoID index is given by default, no need to make extra index for this
            collection = collection.find({ _id: { $lt: new ObjectID(skip) }});
        } else {
            collection = collection.find();
        }

        resp.tweets = await collection.sort({ _id: -1 }).limit(limit).toArray();

        res.json(resp);
    } catch (err) {
        res.status(500).json({
            message: err.message,
        });
    }
});

module.exports = app;

// Start the express server
app.listen(port, err => {
    if (err) throw err;
    console.log(`> Ready On Server http://localhost:${port}`);
});