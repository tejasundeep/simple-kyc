export default function FaceVerify() {
    return (
        <>
            <main className="face_verify">
                <video id="video" width="600" height="450" autoPlay></video>
            </main>
            <script defer src="/static/face-recognizer.js"></script>
        </>
    );
}
