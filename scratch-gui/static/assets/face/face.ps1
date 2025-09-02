# 1) Make folders
$BASE = "C:\scratch\scratch-gui\static\assets\face"
New-Item -ItemType Directory -Force -Path $BASE | Out-Null
New-Item -ItemType Directory -Force -Path "$BASE\wasm","$BASE\models","$BASE\tfjs" | Out-Null

# 2) MediaPipe Tasks bundle (ESM). We’ll save the official vision bundle as tasks-vision.js
$TASKS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs"
Invoke-WebRequest $TASKS_URL -OutFile "$BASE\tasks-vision.js"

# 3) MediaPipe wasm + JS loaders (copy everything commonly needed)
$WASM = @(
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm"
  # If your version also exposes threads/SIMD variants, add them similarly:
  # "vision_wasm_threads_internal.js",
  # "vision_wasm_threads_internal.wasm",
  # "vision_wasm_threads_simd_internal.js",
  # "vision_wasm_threads_simd_internal.wasm"
)
foreach ($f in $WASM) {
  Invoke-WebRequest "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm/$f" -OutFile "$BASE\wasm\$f"
}

# 4) Face detection / landmark models (served locally from /static)
Invoke-WebRequest "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" -OutFile "$BASE\models\blaze_face_short_range.tflite"
Invoke-WebRequest "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -OutFile "$BASE\models\face_landmarker.task"

# 5) TensorFlow.js (only if you use TF.js for embeddings)
Invoke-WebRequest "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js" -OutFile "$BASE\tfjs\tf.min.js"
