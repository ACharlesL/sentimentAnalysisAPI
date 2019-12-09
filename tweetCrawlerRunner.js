const { MongoClient } = require('mongodb');
const axios = require('axios');
const createStream = require('./tweetCrawler');

// Either take the MongoDB connection string from envrionment variable MONGODB_URL or the local mongodb 'twtsnt'
const url = process.env.MONGO_URL || 'mongodb://localhost:27017/twtsnt';
const dbName = 'twtsnt';
// Create a MongoDB client instance
const client = new MongoClient(url, { useNewUrlParser: true });

// Get current Bitcoin price, BTC-USD, from GDAX API (Coinbase Pro)
const getCoinPrice = async (coin = 'btc') => {
    try {
        const res = await axios.get(
            `https://api.gdax.com/products/${coin}-usd/stats`,
        );
        return res.data;
    } catch (err) {
        console.error(err);
        return null;
    }
};

// Calculate the keyword score and save the score along with the keyword analysis data
const calculateAndStore = async (db, keyword) => {
    // get the keyword collection
    const data = db.collection(`keyword_${keyword}`);

    // Lightweight way of getting total document count in the collection
    const totalCount = await data.estimatedDocumentCount();
    // Count positive tweets
    const positiveCount = await data.countDocuments({ score: 1 });
    // Count negative tweets
    const negativeCount = await data.countDocuments({ score: -1 });

    // get bitcoin from coinbase and 24 hour change
    // https://api.gdax.com/products/btc-usd/stats
    // "open":"3804.41000000","high":"3874.12000000","low":"3730.00000000","volume":"8860.63154635","last":"3835.00000000","volume_30day":"452787.73451902"}
    // last / open - 1
    const stats = await getCoinPrice('btc');
    const change = (stats.last / stats.open - 1) * 100;

    // Calculate trend
    const trendFromTweet = ((positiveCount - negativeCount) / totalCount) * 100;

    // "Calc" collection for the keyword calculation
    const calc = db.collection('calc');
    // Create index for the "Calc" collection
    await db.createIndex('calc', { keyword: 1 }, { unique: true });

    // Upsert (Update or create one if not exist) the keyword information
    await calc.updateOne(
        { keyword },
        {
            $set: {
                price: stats.last,
                change,
                trend: trendFromTweet,
                tweetCount: {
                    positive: positiveCount,
                    negative: negativeCount,
                    neutral: totalCount - positiveCount - negativeCount,
                },
                createAt: new Date(),
            },
        },
        { upsert: true },
    );
};

// Create keyword indexes
const createIndex = async (db, keyword) => {
    const indexes = Promise.all([
        // index with score, id, timestamp_ms
        db.createIndex(
            `keyword_${keyword}`,
            {
                score: 1,
                id: 1,
                timestamp_ms: -1,
            },
            {
                unique: true,
            },
        ),
        // index for assigning TTL (remove tweet data older than 24 hours old)
        db.createIndex(
            `keyword_${keyword}`,
            {
                createdAt: 1,
            },
            {
                expireAfterSeconds: 60 * 60 * 24,
            },
        ),
    ]);

    return indexes;
};

const registerKeyword = async (db, keyword, interval) => {
    // Indexes
    await createIndex(db, keyword);

    // Stream
    createStream(db, keyword);

    // Calculate and Store
    calculateAndStore(db, keyword);
    // Repeat
    setInterval(() => {
        calculateAndStore(db, keyword);
    }, interval);
};

(async () => {
    try {
        // Use connect method to connect to the Server
        await client.connect();

        // Database instance
        const db = client.db(dbName);

        // Register "bitcoin" keyword
        await registerKeyword(db, 'bitcoin', 3000);
    } catch (err) {
        console.log(err.stack);
    }
})();