import cv2
import os
import sys
import json
import time

def capture_frame():
    output_dir = "c:/Users/Manish/OneDrive/Desktop/JARVIS/logs"
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"webcam_{int(time.time())}.jpg")

    # Open camera (index 0 is default camera)
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW) # Use CAP_DSHOW on Windows for faster initialization
    
    if not cap.isOpened():
        # Retry with default backend
        cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print(json.dumps({"status": "error", "error": "No webcam or video capture device found."}))
        sys.exit(1)

    # Allow camera to warm up
    time.sleep(0.5)

    ret, frame = cap.read()
    if ret:
        cv2.imwrite(output_path, frame)
        print(json.dumps({"status": "success", "filePath": output_path}))
    else:
        print(json.dumps({"status": "error", "error": "Failed to capture frame from webcam."}))
        
    cap.release()

if __name__ == "__main__":
    try:
        capture_frame()
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))
        sys.exit(1)
