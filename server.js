import path from 'path';
import helmet from 'helmet';
import multer from 'multer';
import express from 'express';
import bodyParser from 'body-parser';
import { body, validationResult } from 'express-validator';
import * as mm from 'music-metadata';
import fs from 'fs';
import NodeID3 from 'node-id3'
import 'dotenv/config';
import { rateLimit } from 'express-rate-limit'

// Setting up environment variables
const port = process.env.PORT || 3000;
const app = express();
const api_key = process.env.API_KEY;
const motor_id = process.env.MOTOR_ID;

// Setting up rate limiting middleware
const limiter = rateLimit({ windowMs: 60 * 1000,  limit: 30 });
app.use(limiter);

// Parsing incoming JSON requests
app.use(bodyParser.json());

// Securing app with Helmet middleware
app.use(
    helmet({
      strictTransportSecurity: { maxAge: 63072000, preload: true },
      contentSecurityPolicy: { useDefaults: true, directives: { styleSrc: ["'self'", "https:"] }},
      xDnsPrefetchControl: { allow: true },
      crossOriginEmbedderPolicy: true,
    })
);
// Disabling x-powered-by header
app.disable("x-powered-by");

// Serving static files from 'public' and 'uploads' directories
app.use('/public', express.static(path.join(process.cwd(), 'public')));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Handling base route, serving index.html file
app.get('/', (req,res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Handling search endpoint with request validation
app.post('/search', [
    body('query').notEmpty().withMessage('Le champ de recherche ne peut pas être vide')
    .isLength({ max: 100 }).withMessage('La recherche peut contenir un maximum de 100 caractères.')
    .trim()
], async (req,res) => {
    // Validating request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json(errors.errors[0].msg);
    }
    try {
        // Encoding user query and constructing search URL
        const userQuery = encodeURIComponent(req.body.query);
        const url = `https://www.googleapis.com/customsearch/v1?key=${api_key}&cx=${motor_id}&q=${userQuery}`;
        // Fetching data from Google Custom Search API
        const response = await fetch(url);
        const data = await response.json();
        res.send(data);
    } catch (error) {
        console.error(`Error when fetching google custom search api : ${error}`);
        res.status(500).send('Error while fetching data.');
    }
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
})

// Initializing multer middleware for file uploads
const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
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

// Function to parse MP3 metadata and remove ID3 tags
async function parseMP3Metadata(filePath) {
    try { 
        await mm.parseFile(filePath); 
        NodeID3.removeTags(filePath); 
    } catch (error) {
        // Deleting the file if parsing fails
        console.error("Error while parsing the file.");
        fs.unlink(filePath, (err) => {
            if (err) throw err;
        });
    }
}

// Function to check magic number of file
function checkMagicNumber(filePath, callback) {
    fs.readFile(filePath, (err,data) => {
        if (err) throw err;
        if (data.toString('hex', 0, 3) == "494433") {
            callback(true);
        }
    });
}

let lastFile = ''; // keep track of last uploaded file 

// Handling file upload endpoint
app.post("/upload", upload.single('mp3file'), function(req, res) {
    const filePath = path.join(process.cwd(), 'uploads', req.file.filename);
    
    // Deleting previous file if exists
    if (lastFile) {
        fs.unlink(lastFile, (err) => {
            if (err) throw err;
        });
    }

    lastFile = filePath; // Updating lastFile variable with current file path
  
    // Checking magic number and parsing metadata of uploaded MP3 file
    checkMagicNumber(filePath, (result) => {
        if (result === true) {
            // Parsing metadata and sending response
            parseMP3Metadata(filePath)
            .then(() => {
                res.json({ filePath: `/uploads/${req.file.filename}` });
            })
            .catch(error => {
                console.log(error);
                res.status(500).send('Error while parsing the file.');
            });
        } else {
            // Deleting invalid file
            fs.unlink(filePath, (err) => {
                if (err) throw err;
            });
        }
    })
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});