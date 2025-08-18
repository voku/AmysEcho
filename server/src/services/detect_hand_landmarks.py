import sys
import json
import base64
import numpy as np
import cv2
import mediapipe as mp

def detect_landmarks(base64_image_string):
    """
    Detects hand landmarks in a base64 encoded image.
    Args:
        base64_image_string: A string containing the base64 encoded image.
    Returns:
        A JSON string containing the detected landmarks or an empty list.
    """
    try:
        # Decode the base64 string
        image_data = base64.b64decode(base64_image_string)
        
        # Convert the binary data to a numpy array
        np_arr = np.frombuffer(image_data, np.uint8)
        
        # Decode the numpy array into an image
        image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        # MediaPipe requires RGB images
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        # Initialize MediaPipe Hands
        mp_hands = mp.solutions.hands
        with mp_hands.Hands(
            static_image_mode=True,
            max_num_hands=1,
            min_detection_confidence=0.5) as hands:
            
            # Process the image
            results = hands.process(image_rgb)

            # Extract landmarks
            if results.multi_hand_landmarks:
                hand_landmarks_list = []
                for hand_landmarks in results.multi_hand_landmarks:
                    landmarks = []
                    for landmark in hand_landmarks.landmark:
                        landmarks.append([landmark.x, landmark.y, landmark.z])
                    hand_landmarks_list.append(landmarks)
                return json.dumps(hand_landmarks_list)
            else:
                return json.dumps([])

    except Exception as e:
        # Return an empty list in case of any error
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    # The first argument is the script name, the second is the base64 string
    if len(sys.argv) > 1:
        base64_input = sys.argv[1]
        landmarks_json = detect_landmarks(base64_input)
        print(landmarks_json)
    else:
        print(json.dumps({"error": "No image data provided."}))
