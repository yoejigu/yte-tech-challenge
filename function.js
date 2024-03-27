const mysql = require('mysql');

// Configure MySQL connection parameters
const dbConfig = {
    host: 'db-inst7d095b4.c30syi8w441i.us-east-1.rds.amazonaws.com',
    user: 'testuser',
    password: 'usertest24',
    database: 'objecttracking'
};

// Create a MySQL connection pool
const pool = mysql.createPool(dbConfig);

exports.handler = async (event, context) => {
    // Log the event received from S3
    console.log('Received event:', JSON.stringify(event, null, 2));

    // Process the event (e.g., extract object information, perform actions)
    event.Records.forEach(record => {
        // Extract bucket name and object key
        const bucketName = record.s3.bucket.name;
        const objectKey = record.s3.object.key;
        
        // Perform desired actions with the bucket name and object key
        console.log(`New object added to bucket '${bucketName}': ${objectKey}`);

        // Insert the object key into the RDS database
        insertObjectKey(objectKey);
    });

    // Optionally, you can return a response
    return {
        statusCode: 200,
        body: JSON.stringify('Lambda function executed successfully')
    };
};

// Function to insert the object key into the RDS database
function insertObjectKey(objectKey) {
    pool.getConnection(function(err, connection) {
        if (err) {
            console.error('Error connecting to database:', err);
            return;
        }

        const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        // Perform the database query to insert the object key
        const sql = 'INSERT INTO objecttracking (object_key) VALUES (?)';
        connection.query(sql, [objectKey], function(error, results, fields) {
            connection.release();
            if (error) {
                console.error('Error inserting object key:', error);
                return;
            }
            console.log('Object key inserted successfully:', objectKey);
        });
    });
}