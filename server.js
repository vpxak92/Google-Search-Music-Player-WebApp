import 'dotenv/config';
import path from 'path';
import helmet from 'helmet';
import multer from 'multer';
import express from 'express';
import { readFile } from 'fs';
import NodeID3 from 'node-id3';
import bodyParser from 'body-parser';
import * as mm from 'music-metadata';
import { unlink } from 'node:fs/promises';
import { rateLimit } from 'express-rate-limit';
import { body, validationResult } from 'express-validator';

// Setting up environment variables & rate limiting middleware
const port = process.env.PORT || 3000;
const app = express();
const api_key = process.env.API_KEY;
const motor_id = process.env.MOTOR_ID;
const limiter = rateLimit({ windowMs: 60 * 1000,  limit: 10 });

app.use(limiter);   // Rate limiting ( 10req/min )
app.use(bodyParser.json());   // Parsing incoming JSON requests
app.use(   // Setting up Helmet middleware
    helmet({
      strictTransportSecurity: { maxAge: 63072000, preload: true },
      contentSecurityPolicy: { useDefaults: true, directives: { styleSrc: ["'self'", "https:"] }},
      xDnsPrefetchControl: { allow: true },
      crossOriginEmbedderPolicy: true,
    })
);
app.disable("x-powered-by");   // Disabling x-powered-by header

// Serving static files from 'public' and 'uploads' directories
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Handling base route, serving index.html file
app.get('/', (req,res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Setting up multer storage (Store file in /uploads and give them random name)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null,  path.join(process.cwd(), 'uploads'))
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      cb(null, file.fieldname + '-' + uniqueSuffix)
    }
});

// Initializing multer middleware for file uploads
const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {  // Check MimeType
        if (file.mimetype === 'audio/mpeg') { 
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only MP3 files are allowed.'), false);
        }
    },
    limits: {
        fileSize: 7000000 
    }
});

let currentFilePath = null;

// Handling file upload endpoint
app.post("/upload", upload.single('mp3file'), function(req, res) {
    const filePath = path.join(process.cwd(), 'uploads', req.file.filename);
    
    if (currentFilePath) {    // Delete last uploaded file if exist
        deleteFile(currentFilePath);
    }

    // Checking magic number and parse metadata
    checkMagicNumber(filePath, (result) => {    // Check Magic Number
        if (result === true) {
            parseMP3Metadata(filePath, (parseResult) => {    // Parse MetaData
                if (parseResult === true) {
                    currentFilePath = filePath;
                    res.json({ filePath: `/uploads/${req.file.filename}` });    // Send back path to the file 
                } else {
                    res.status(500).send('Error while parsing the file.');
                }
            })
        } else {
            deleteFile(filePath)
        }
    })
});

// Handling search endpoint with request validation
app.post('/search', [ 
    body('query').trim()
    .notEmpty().withMessage('Le champ de recherche ne peut pas être vide')
    .isLength({ max: 100 }).withMessage('La recherche peut contenir un maximum de 100 caractères.')
], 
async (req,res) => {
    const result = validationResult(req);   // Validate the user query
    if (result.isEmpty()) {
        try {
            // Craft url to fetch data from google custom search api and send result back to user
            const userQuery = encodeURIComponent(req.body.query);
            const url = `https://www.googleapis.com/customsearch/v1?key=${api_key}&cx=${motor_id}&q=${userQuery}`;
            const response = await fetch(url);
            const data = await response.json();
            return res.send(data);
        } catch (error) {
            console.error(`Error when fetching google custom search api : ${error}`);
            res.status(500).send('Error while fetching data.');
        }
    }
    res.send({ errors: result.errors.msg });
});

async function parseMP3Metadata(filePath, callback) {   // parse MP3 metadata and remove ID3 tags
    try { 
        await mm.parseFile(filePath); 
        NodeID3.removeTags(filePath);
        callback(true)
    } catch (error) {
        deleteFile(filePath);
        console.error("Error while parsing the file.");
    }
}

function checkMagicNumber(filePath, callback) {   // Check Magic Number
    try {
        readFile(filePath, (err, data) => {
            if (data.toString('hex', 0, 3) == "494433") {
                callback(true);
            }
        });
    } catch (error) {
        console.error('Error while reading the file.')
    }
}

async function deleteFile(fileToDelete) {
    try {
        await unlink(fileToDelete);
        console.log('file deleted successfully');
    } catch (error) {
        console.error('error:', error.message);
    }
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});