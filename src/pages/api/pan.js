const panHandler = (req, res) => {
    const incomingPan = req.body.pan;

    const predefinedPan = 'DIKPK2123M';

    if (incomingPan === predefinedPan) {
        const data = {
            "data": {
                "aadhaar_seeding_status": "LINKED", // optional
                "category": "Individual",
                "full_name": "KARRI TEJA SUNDEEP REDDY",
            },
            "message": "PAN is valid",
            "verification": "success",
            "traceId": "1-6346a91a-620cf6cc4f68d2e30316881e",
        };

        res.status(200).json(data);
    } else {
        // Respond with an error or appropriate message if the PAN numbers do not match
        res.status(400).json({ error: 'Invalid PAN number' });
    }
};

export default panHandler;
