const dotenv = require('dotenv');
dotenv.config();
const fetch = require('node-fetch');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const multer = require('multer');
const multerS3 = require('multer-s3');
const fs = require('fs');
const aws = require('aws-sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const pubClient = createClient({
    url : "redis://52.79.80.117:6379"
});
const subClient = pubClient.duplicate();

const s3 = new aws.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, 'uploadedFiles/');
    },
    filename(req, file, cb) {
        cb(null, `${Date.now()}_${file.originalname}`);
    },
});
const upload = multer({ storage: storage });
const uploadS3 = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_S3BUCKET_NAME,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function(req, file, cb) {
            cb(null, `${Date.now()}_${file.originalname}`);
        },
    }),
});

pubClient.on('connect', function() {
    console.log('pubClient connected');
});

subClient.on('connect', function() {
    console.log('subClient connected');
    subClient.subscribe('message');
});

Promise.all([pubClient.connect(), subClient.connect()]).then(()=> {
    const redisAdapter = createAdapter(pubClient, subClient);
    io.adapter(redisAdapter);
    server.listen(3030, ()=> {
        var dir = './uploadedFiles';
        if(!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        console.log('server is listening on port 3030');
    });
});

app.get('/GetServerIP', async(req, res) => {
    fetch("https://checkip.amazonaws.com/")
        .then(cres => cres.text())
        .then(data => res.json(data));
});

app.post('/upload', upload.single('attachment'), async(req, res) => {
    res.json({ 'code': 'success'});
});

app.post('/uploadS3', uploadS3.single('attachment'), async(req, res) => {
    res.json({ 'code': 'success'});
});

io.on('connection', function(socket) {
    console.log('connection is establish');
    
    socket.on('new-message', function(data) {
        console.log(data);
        socket.broadcast.emit('new-message', data);
    });

    socket.on('forceDisconnect', function() {

    });
    
    socket.on('disconnect', function() {
        console.log('user disconnect');
    });
});

