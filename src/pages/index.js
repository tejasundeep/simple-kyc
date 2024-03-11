import React, { useState } from 'react';
import axios from 'axios';

const API_UPLOAD_ENDPOINT = '/api/upload';

const FileInput = ({ id, onChange, fileType }) => (
    <>
        <label htmlFor={id}>Select {fileType}</label><br />
        <input type="file" id={id} onChange={onChange} /><br /><br />
    </>
);

const UploadButton = ({ onClick }) => (
    <button onClick={onClick}>Verify</button>
);

const ScrapedTextDisplay = ({ scrapedText }) => (
    <div>
        <h2>Details</h2>
        {scrapedText.map((text, index) => (
            <div key={index}>
                {index === 0 && <p>Name: {text}</p>}
                {index === 1 && <p>Father's Name: {text}</p>}
                {index === 2 && <p>PAN Number: {text}</p>}
                {index === 3 && <p>DOB: {text}</p>}
            </div>
        ))}
    </div>
);

const Home = () => {
    const [selectedFiles, setSelectedFiles] = useState([null, null]);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);
    const [matchingStatus, setMatchingStatus] = useState(null);
    const [scrapedText, setScrapedText] = useState([]);

    const handleFileChange = (index, e) => {
        const newFiles = [...selectedFiles];
        newFiles[index] = e.target.files[0];
        setSelectedFiles(newFiles);
    };

    const handleUpload = async () => {
        try {
            setLoading(true);
            setErrorMsg(null);

            const formData = new FormData();
            selectedFiles.forEach((file, index) => {
                formData.append(`image`, file);
            });

            const response = await axios.post(API_UPLOAD_ENDPOINT, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            setMatchingStatus(response.data.matchingStatus);

            // Map the scraped names from the response to the scrapedText array
            const scrapedNames = response.data.texts.map((item) => item.split(' ').join(' '));
            setScrapedText(scrapedNames);
        } catch (error) {
            console.error('Upload failed:', error.message);
            setErrorMsg('Upload failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='card'>
            <h1>Simple <span>KYC</span></h1>
            {matchingStatus && <p className='msg'>{matchingStatus}</p>}
            {loading && <p>Uploading...</p>}
            {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
            <br />
            <FileInput id="fileInput1" onChange={(e) => handleFileChange(0, e)} fileType="Pan Card" />
            <FileInput id="fileInput2" onChange={(e) => handleFileChange(1, e)} fileType="Aadhaar Card" />
            <UploadButton onClick={handleUpload} />
            {scrapedText.length > 0 && <ScrapedTextDisplay scrapedText={scrapedText} />}
        </div>
    );
};

export default Home;
