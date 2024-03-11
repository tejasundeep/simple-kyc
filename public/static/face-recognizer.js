class FaceRecognition {
    // Configuration and state variables
    config;
    videoElement;
    canvas;
    displaySize;
    labeledDescriptors = new Map();
    canvasPool = [];
    maxCanvasPoolSize = 10;
    faceMatcher;
    videoStream;

    // Constructor initializes the FaceRecognition instance with a given configuration
    constructor(config) {
        this.config = config;
        this.videoElement = document.getElementById(config.videoElementId) || this.createVideoElement();
    }

    // Static method to load face recognition models from a specified URI
    static async loadModels(modelUri) {
        if (!this.modelLoader) {
            this.modelLoader = Promise.allSettled([
                faceapi.nets.ssdMobilenetv1.loadFromUri(modelUri),
                faceapi.nets.faceRecognitionNet.loadFromUri(modelUri),
                faceapi.nets.faceLandmark68Net.loadFromUri(modelUri),
                faceapi.nets.faceExpressionNet.loadFromUri(modelUri)
            ]).then(results => {
                if (results.some(result => result.status === 'rejected')) {
                    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
                    console.error('Error loading models:', errors);
                    return Promise.reject(errors);
                }
                return true;
            });
        }
        return this.modelLoader;
    }

    // Initialize the FaceRecognition instance
    async initialize() {
        try {
            await FaceRecognition.loadModels(this.config.modelUri);
            await this.setupWebcam();
            this.startProcessing();
        } catch (error) {
            console.error(`Error during initialization: ${error}`);
            throw error;
        }
    }

    // Create a video element and append it to the document body
    createVideoElement() {
        const video = document.createElement('video');
        video.id = this.config.videoElementId;
        document.body.append(video);
        return video;
    }

    // Set up the webcam and initialize video streaming
    async setupWebcam() {
        if (!this.videoStream) {
            this.videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
            this.videoElement.srcObject = this.videoStream;
            await new Promise(resolve => this.videoElement.onloadedmetadata = resolve);
            this.createCanvas();
            this.updateCanvasSize();
        }
    }

    // Stop webcam and perform cleanup
    async stopWebcam() {
        if (this.videoStream) {
            await Promise.all(this.videoStream.getTracks().map(track => track.stop()));
            this.videoStream = null;
            this.videoElement.srcObject = null;
            this.cleanupCanvas();
            this.disposeFaceMatcher();
        }
    }

    // Start processing video frames when the video starts playing
    startProcessing() {
        this.videoElement.addEventListener('play', async () => {
            this.setupCanvas();
            await this.setupFaceMatcher();
            requestAnimationFrame(() => this.processVideoFrames());
        });
        this.videoElement.onended = () => this.stopProcessing();
    }

    // Stop video processing and webcam when the video ends
    stopProcessing() {
        this.videoElement.removeEventListener('play', () => this.processVideoFrames());
        this.stopWebcam();
    }

    // Set up the canvas for drawing face recognition results
    setupCanvas() {
        if (!this.canvas) {
            this.canvas = this.canvasPool.length > 0 ? this.canvasPool.pop() : document.createElement('canvas');
            document.body.append(this.canvas);
            const { width, height } = this.videoElement;
            this.displaySize = { width, height };
            faceapi.matchDimensions(this.canvas, this.displaySize);
        }
    }

    // Create a canvas element
    createCanvas() {
        if (!this.canvas) {
            this.canvas = this.canvasPool.length > 0 ? this.canvasPool.pop() : document.createElement('canvas');
            document.body.append(this.canvas);
        }
    }

    // Update canvas size based on the video element's size
    updateCanvasSize() {
        if (this.canvas) {
            const { width, height } = this.videoElement;
            this.displaySize = { width, height };
            faceapi.matchDimensions(this.canvas, this.displaySize);
        }
    }

    // Set up the face matcher for recognizing known faces
    async setupFaceMatcher() {
        if (!this.faceMatcher) {
            if (this.labeledDescriptors.size === 0) {
                this.labeledDescriptors = await this.getLabeledFaceDescriptors(this.config.labels);
            }

            const labeledDescriptorsArray = Array.from(this.labeledDescriptors.entries()).map(([label, descriptors]) =>
                new faceapi.LabeledFaceDescriptors(label, descriptors));

            this.faceMatcher = new faceapi.FaceMatcher(labeledDescriptorsArray);
        }
    }

    // Process video frames for face detection, landmarks, descriptors, and expressions
    async processVideoFrames() {
        if (!this.videoElement) return;

        const detections = await faceapi.detectAllFaces(this.videoElement,
            new faceapi.SsdMobilenetv1Options({ minConfidence: this.config.minConfidenceThreshold }))
            .withFaceLandmarks()
            .withFaceDescriptors()
            .withFaceExpressions();

        const resizedDetections = faceapi.resizeResults(detections, this.displaySize);
        this.updateCanvas(resizedDetections);
        requestAnimationFrame(() => this.processVideoFrames());
    }

    // Update the canvas with face recognition results
    updateCanvas(detections) {
        const context = this.canvas.getContext('2d');
        context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        detections.forEach(detection => {
            const match = this.faceMatcher.findBestMatch(detection.descriptor);
            const isKnown = match.distance < this.config.distanceThreshold;
            const isSmiling = detection.expressions?.happy > this.config.smileDetectionThreshold;

            let label = '';

            if (isKnown) {
                label = isSmiling ? 'Known Smiling' : 'Known Not Smiling';
            } else {
                label = isSmiling ? 'Unknown Smiling' : 'Unknown Not Smiling';
            }

            new faceapi.draw.DrawBox(detection.detection.box, { label }).draw(this.canvas);
        });
    }

    // Fetch labeled face descriptors for known labels
    async getLabeledFaceDescriptors(labels) {
        const descriptors = new Map();

        for (const label of labels) {
            if (!this.labeledDescriptors.has(label)) {
                const imagePath = `/static/labels/${label}.jpg`;
                try {
                    const img = await faceapi.fetchImage(imagePath);
                    const detections = await faceapi.detectAllFaces(img)
                        .withFaceLandmarks()
                        .withFaceDescriptors();

                    if (detections.length > 0) {
                        descriptors.set(label, detections.map(({ descriptor }) => descriptor));
                    }
                } catch (error) {
                    console.error(`Error processing image ${imagePath}: ${error}`);
                }
            }
        }

        return descriptors;
    }

    // Clean up the canvas and add it to the pool for reuse
    cleanupCanvas() {
        if (this.canvas) {
            if (this.canvasPool.length < this.maxCanvasPoolSize) {
                this.canvasPool.push(this.canvas);
            } else {
                this.canvas.remove();
            }
            this.canvas = null;
        }
    }

    // Dispose of unused labeled descriptors
    disposeUnusedResources() {
        this.labeledDescriptors.clear();
    }

    // Dispose of the face matcher
    disposeFaceMatcher() {
        if (this.faceMatcher) {
            this.faceMatcher.dispose();
            this.faceMatcher = null;
        }
    }
}

// Fetch labels from the server
const fetchLabels = async () => {
    try {
        const response = await fetch('http://localhost:3000/api/images');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const { images } = await response.json();
        return images;
    } catch (error) {
        console.error(`Error fetching labels: ${error}`);
        throw error;
    }
};

// Initialize the face recognition system
const initializeFaceRecognition = async () => {
    try {
        const labels = await fetchLabels();

        const CONFIG = {
            modelUri: '/static/models',
            videoElementId: 'video',
            labels,
            minConfidenceThreshold: 0.6,
            distanceThreshold: 0.5,
            smileDetectionThreshold: 0.5
        };

        const faceRecognition = new FaceRecognition(CONFIG);
        await faceRecognition.initialize();
    } catch (error) {
        console.error(`Error during initialization: ${error}`);
    }
};

// Call the initialization function
initializeFaceRecognition();
