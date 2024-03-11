// Import necessary libraries and modules
import multer from "multer";
import { createCanvas, loadImage } from "canvas";
import { recognize } from "tesseract.js";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";

// Constants for image canvas dimensions and upload directory
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const UPLOADS_DIR = path.join(process.cwd(), "public", "static", "labels");

// Ensure the directory for uploads exists
const mkdirAsync = async (dir) => {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        handleErrors("Creating directory", error);
    }
};

mkdirAsync(UPLOADS_DIR);

// Function to handle errors
const handleErrors = (prefix, error) => {
    console.error(`${prefix}: ${error.message}`);
    throw new Error(`${prefix} error: ${error.message}`);
};

// Function to generate a unique filename using UUID
const generateUniqueFileName = () => `${uuidv4()}.jpg`;

// Function to filter words and remove non-alphabetic characters
const filterWords = (words) =>
    words
        .filter((word) => !["&"].some((symbol) => word.includes(symbol)))
        .map(removeNonAlphabetic);

// Function to remove non-alphabetic characters from a word
const removeNonAlphabetic = (word) => word.replace(/[^a-zA-Z]/g, "");

// Function to find common elements between two texts
const findCommonElements = (textOne, textTwo) => {
    const filteredWords1 = filterWords(textOne.split(/\s+/).filter((word) => word.trim() !== ""));
    const filteredWords2 = filterWords(textTwo.split(/\s+/).filter((word) => word.trim() !== ""));
    return filteredWords1.filter((word) => filteredWords2.includes(word));
};

// Class for image processing operations
class ImageProcessor {
    preprocessImage = async (buffer) => {
        try {
            // Generate a unique filename for the processed image
            const uniqueFileName = generateUniqueFileName();

            // Load the image from the buffer
            const img = await loadImage(buffer);

            // Create a canvas and draw the image onto it
            const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Save the processed image to the specified path
            const imagePath = path.join(UPLOADS_DIR, path.basename(uniqueFileName));
            const imageBuffer = canvas.toBuffer("image/jpeg");
            await fs.writeFile(imagePath, imageBuffer);

            return imagePath;
        } catch (error) {
            handleErrors("ImageProcessor.preprocessImage", error);
        }
    };
}

// Class for text recognition operations
class TextRecognizer {
    static recognizeText = async (imgPath) => {
        try {
            // Use Tesseract.js to recognize text from the image
            const { data: { text } } = await recognize(imgPath, "eng", {
                tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
                tessedit_pageseg_mode: 3,
            });
            return text;
        } catch (error) {
            handleErrors(`TextRecognizer.recognizeText for image ${imgPath}`, error);
        }
    };
}

// Class for handling image uploads
class ImageUploader {
    static uploadImages = async (req, res = {}) => {
        // Middleware configuration for handling file uploads
        const uploadMiddleware = multer({
            fileFilter: (req, file, cb) => {
                if (file.mimetype.startsWith("image/")) {
                    cb(null, true);
                } else {
                    cb(new Error("Invalid file type. Only images are allowed."));
                }
            },
            limits: { fileSize: 1024 * 1024 * 5 }, // 5MB file size limit
        }).array("image", 2);

        try {
            // Use promise to handle the asynchronous upload process
            await new Promise((resolve, reject) => {
                uploadMiddleware(req, res, (err) => {
                    if (err) {
                        handleErrors("ImageUploader.uploadImages", err);
                        reject(new Error(`Image upload error: ${err.message}`));
                    } else {
                        resolve();
                    }
                });
            });
        } catch (error) {
            handleErrors("ImageUploader.uploadImages", error);
            throw new Error(`Image upload error: ${error.message}`);
        }
    };
}

// Class for managing dependencies
class DependencyContainer {
    static getTextRecognizerInstance = () => TextRecognizer;

    static getImageUploaderInstance = () => ImageUploader;
}

// Function to process an image and recognize text
const processImageAndRecognizeText = async (file, textRecognizer) => {
    try {
        const imageProcessor = new ImageProcessor();
        const imagePath = await imageProcessor.preprocessImage(file.buffer);
        const text = await textRecognizer.recognizeText(imagePath);
        return { text, fileName: file.originalname };
    } catch (error) {
        handleErrors("Processing image and recognizing text", error);
    }
};

// Configuration for the API endpoint
export const config = {
    api: {
        bodyParser: false,
    },
};

// Main handler function for the API endpoint
export default async function handler(req, res) {
    // Check if the request method is POST
    if (req.method !== "POST") {
        return res.status(405).end();
    }

    try {
        // Upload images using the ImageUploader class
        await ImageUploader.uploadImages(req, res);

        // Check if exactly two files were uploaded
        if (!req.files || req.files.length !== 2) {
            return res.status(400).json({ success: false, error: "Two files are required" });
        }

        // Get an instance of the TextRecognizer class
        const textRecognizer = DependencyContainer.getTextRecognizerInstance();

        // Process each uploaded image and recognize text
        const processedImages = await Promise.all(
            req.files.map((file) => processImageAndRecognizeText(file, textRecognizer))
        );

        // Extract text from processed images
        const [textOne, textTwo] = processedImages.map((img) => img.text);

        // Find common elements between the recognized texts
        const commonElements = findCommonElements(textOne.toLowerCase(), textTwo.toLowerCase());

        // Remove duplicates and filter alphanumeric common elements
        const uniqueCommonElements = [...new Set(commonElements)].filter((word) =>
            /^[a-zA-Z]+$/.test(word)
        );

        // Determine matching status based on the presence of common elements
        const matchingStatus = uniqueCommonElements.length === 0 ? "Not Matched" : "Matched";

        // Extract PAN number from the recognized text
        const panNumbersMatch = textOne.match(/[A-Z]{5}[0-9]{4}[A-Z]/);
        const panNumber = panNumbersMatch ? panNumbersMatch[0] : null;

        // Fetch the PAN card verification API endpoint from environment variables
        const pancardApi = process.env.PANCARD_API || null;

        // Check if the API endpoint is defined
        if (!pancardApi) {
            return res.status(500).json({ success: false, error: "PANCARD_API not defined" });
        }

        // Perform PAN card verification using the API
        const pancardVerifyResponse = await fetch(pancardApi, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // 'x-client-id': 'a85913df-8721-44ff-98f2-91fc632ed556',
                // 'x-client-secret': 'f8188e49-9cb6-44db-bf72-2796161c7710',
                // 'x-product-instance-id': '891707ee-d6cd-4744-a28d-058829e30f10'
            },
            body: JSON.stringify({ // body is according to apisetu
                pan: panNumber,
                consent: "Y",
                reason: "Reason for verifying PAN set by the developer",
            }),
        });

        let panVerify;

        try {
            // Check if the PAN card verification request was successful
            if (!pancardVerifyResponse.ok) {
                throw new Error("PANCARD_API request failed");
            }

            // Parse the response from the PAN card verification API
            panVerify = await pancardVerifyResponse.json() || null;
        } catch (error) {
            // Handle error response from PAN card verification API
            panVerify = { data: { full_name: null } };
        }

        const extractDate = (textOne.match(/\b(\d{2}\/\d{2}\/\d{4})\b/) || [])[0] || "None";
        const indiaIndex = textOne.toUpperCase().indexOf('INDIA');
        const extractedInfo = textOne.substring(indiaIndex + 'INDIA'.length)
            .match(/[A-Z][A-Z\s]*/g)
            ?.filter(word => word.split(/\s+/).some(part => part.length > 1))
            ?.join(', ')
            ?.split(', ')
            ?.slice(0, 2)
            ?.map(word => word.replace(/\b\w\b/g, ''))
            ?.map(str => str.trim());

        extractedInfo.push(panNumber);
        extractedInfo.push(extractDate);

        // Respond with the processed data
        res.status(200).json({
            success: true,
            texts: extractedInfo,
            commonElements,
            matchingStatus,
            panVerify: panVerify.data.full_name ? true : false
        });
    } catch (error) {
        // Handle internal server errors and respond with an error message
        handleErrors("Internal Server Error", error);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
}
