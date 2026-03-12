from fastapi import FastAPI, File, UploadFile
import numpy as np
import cv2
import uuid
import os

app = FastAPI(title="Personal Color AI Worker")

ONNX_MODEL_PATH = os.getenv("ONNX_MODEL_PATH", "/app/models/personal_color_model.onnx")

SEASON_MAP = {
    0: {"season": "spring", "label": "봄 웜톤",   "description": "밝고 따뜻한 피치, 코랄, 아이보리 계열"},
    1: {"season": "summer", "label": "여름 쿨톤",  "description": "부드러운 라벤더, 로즈, 뮤트 핑크 계열"},
    2: {"season": "autumn", "label": "가을 웜톤",  "description": "깊고 따뜻한 카멜, 테라코타, 올리브 계열"},
    3: {"season": "winter", "label": "겨울 쿨톤",  "description": "선명한 버건디, 네이비, 블랙 계열"},
}

PALETTE_MAP = {
    "spring":  ["#FFB347", "#FF8C69", "#FFDAB9", "#98FB98", "#FFFACD"],
    "summer":  ["#DDA0DD", "#B0C4DE", "#FFB6C1", "#E6E6FA", "#F0FFFF"],
    "autumn":  ["#D2691E", "#CD853F", "#8B4513", "#556B2F", "#DAA520"],
    "winter":  ["#DC143C", "#00008B", "#2F4F4F", "#800080", "#191970"],
}


def analyze_skin_tone(image_bytes: bytes) -> dict:
    """ONNX 모델 없을 때 OpenCV 기반 간이 분석"""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return SEASON_MAP[0]

    # 화이트밸런스 보정
    img_float = img.astype(np.float32)
    avg_b = np.mean(img_float[:, :, 0])
    avg_g = np.mean(img_float[:, :, 1])
    avg_r = np.mean(img_float[:, :, 2])
    avg = (avg_b + avg_g + avg_r) / 3
    img_float[:, :, 0] = np.clip(img_float[:, :, 0] * (avg / avg_b), 0, 255)
    img_float[:, :, 1] = np.clip(img_float[:, :, 1] * (avg / avg_g), 0, 255)
    img_float[:, :, 2] = np.clip(img_float[:, :, 2] * (avg / avg_r), 0, 255)
    img = img_float.astype(np.uint8)

    # 피부 영역 평균 색상 추출
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower = np.array([0,  20,  70], dtype=np.uint8)
    upper = np.array([20, 150, 255], dtype=np.uint8)
    mask  = cv2.inRange(hsv, lower, upper)
    skin  = cv2.bitwise_and(img, img, mask=mask)
    pixels = skin[mask > 0]

    if len(pixels) == 0:
        return SEASON_MAP[1]

    avg_color = np.mean(pixels, axis=0)
    b, g, r = avg_color

    # 간이 계절 분류
    warmth     = r - b
    brightness = (r + g + b) / 3

    if   warmth > 20 and brightness > 150:
        idx = 0  # spring
    elif warmth <= 0 and brightness > 140:
        idx = 1  # summer
    elif warmth > 20 and brightness <= 150:
        idx = 2  # autumn
    else:
        idx = 3  # winter

    return SEASON_MAP[idx]


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    image_bytes = await file.read()

    if os.path.exists(ONNX_MODEL_PATH):
        # TODO: ONNX 모델 추론 구현 예정. 현재는 OpenCV fallback으로 진행
        pass

    result  = analyze_skin_tone(image_bytes)
    season  = result["season"]
    result_id = str(uuid.uuid4())

    # 원본 이미지 즉시 파기 (Privacy-First)
    del image_bytes

    return {
        "result_id":   result_id,
        "season":      season,
        "label":       result["label"],
        "description": result["description"],
        "palette":     PALETTE_MAP[season],
        "makeup": {
            "lip":    "코랄 핑크" if season in ["spring", "autumn"] else "로즈 핑크",
            "shadow": "브라운 계열" if season in ["spring", "autumn"] else "그레이 계열",
        },
        "hair": {
            "color":  "애쉬 브라운" if season in ["summer", "winter"] else "골든 브라운",
            "recipe": "애쉬 6 : 베이지 3 : 블루 1" if season in ["summer", "winter"] else "골든 8 : 코퍼 2",
        },
        "fashion": {
            "colors": PALETTE_MAP[season],
            "style":  "내추럴 & 웜" if season in ["spring", "autumn"] else "클린 & 쿨",
        },
    }
