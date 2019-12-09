const Twit = require('twit');
const Sentiment = require('sentiment');

// Create a sentiment instance
const sentiment = new Sentiment();

// Create a Twit instance
const T = new Twit({
    consumer_key: 'WAqaGNwnMZHuy9S65EAi97xYc', // Twitter Developer - https://developer.twitter.com
    consumer_secret: 'Pc9OavCe4DlNIuDQA3Hl2UVcqc9FnIgHw3yaaiTmeXLvtfkkvu',
    access_token: '1196823673816137729-8i8royZCSIDSpOcd2OS42lBImyNgen',
    access_token_secret: '7b648qIZ8zZXFu9hhJ44iQsvvp8WNCz4YpwDOumJPCeuO',
    timeout_ms: 60 * 1000, // optional HTTP request timeout to apply to all requests.
    strictSSL: true, // optional - requires SSL certificates to be valid.
});

// Take a MongoDB instance and a string keyword as parameter
module.exports = (db, keyword) => {
    // Create a Tweet stream with given keyword
    const stream = T.stream('statuses/filter', {
        track: keyword,
    });

    // When a new tweet with the keyword is published, this function will be called
    stream.on('tweet', async tweet => {
        const {
            created_at,
            id,
            lang,
            text,
            user: { screen_name, profile_image_url_https },
            timestamp_ms,
        } = tweet;

        // Since the sentiment only supports English, it need to be filtered with language, "en".
        if (lang === 'en') {
            let { score } = sentiment.analyze(text);
            if (score > 0) { // Treat greater than zero as 1
                score = 1;
            } else if (score < 0) { // Treat less than zero as -1
                score = -1;
            }

            // Save the tweet information with the score in the keyword collection
            await db.collection(`keyword_${keyword}`).insertOne({
                score,
                createdAt: new Date(created_at),
                id,
                lang,
                text,
                screen_name,
                profile_image_url_https,
                timestamp_ms,
            });
        }
    });
};