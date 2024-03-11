import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
    // Set the path to your images directory
    const imagesDirectory = path.join(process.cwd(), 'public/static/labels');

    // Read the files in the images directory
    const fileNames = fs.readdirSync(imagesDirectory);

    // Filter out non-image files if needed
    const imageFiles = fileNames.filter(fileName =>
        /\.(jpg|jpeg|png|gif)$/i.test(fileName)
    );

    // Generate an array of image URLs without file extensions
    const imageUrls = imageFiles.map(fileName => path.parse(fileName).name);

    // Return the list of image URLs in JSON format
    res.status(200).json({ images: imageUrls });
}
