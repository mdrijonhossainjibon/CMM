"""Scene classification module.

Scene model abstraction that maps raw inference signals (YOLO detections +
ImageNet classifier) into the KB-L scene taxonomy:

    beach sea forest jungle room road mountain snow desert city cave grassland sky river

A custom EfficientNet-B0 scene model can be dropped into
``backend/vision/models/scene_efficientnet.pt`` and it will be used
automatically if present. Otherwise a fallback estimator (YOLO detections +
ImageNet probability mapping) keeps the pipeline functional without weights.
"""
import os
import json
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger("captchamaster.vision.scene")

SCENE_CLASSES: List[str] = [
    "beach", "sea", "forest", "jungle", "room", "road", "mountain",
    "snow", "desert", "city", "cave", "grassland", "sky", "river",
]

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
CUSTOM_SCENE_WEIGHTS = os.path.join(MODELS_DIR, "scene_efficientnet.pt")

# ImageNet (torchvision) synset -> scene mapping. Model e custom weights na thakle
# ImageNet probability e mapping diye meaningful, zero-download scene score dei.
# Key = lowercase ImageNet class name, value = (scene, weight).
IMAGENET_TO_SCENE: Dict[str, List[tuple]] = {
    "seashore": [("beach", 1.0), ("sea", 0.8)],
    "beacon": [("beach", 0.6)],
    "lake": [("river", 0.6), ("sea", 0.5)],
    "sea snake": [("sea", 1.0)],
    "gondola": [("river", 0.5), ("sea", 0.5)],
    "sewing machine": [("cave", 0.3)],
    "cliff": [("mountain", 0.7), ("sea", 0.5)],
    "volcano": [("mountain", 0.8)],
    "alp": [("mountain", 1.0)],
    "mountain tent": [("mountain", 0.8)],
    "rock": [("mountain", 0.5), ("cave", 0.4)],
    "coral reef": [("sea", 0.9)],
    "snowplow": [("snow", 0.7)],
    "ski": [("snow", 0.8)],
    "ice": [("snow", 0.8)],
    "snowmobile": [("snow", 0.8)],
    "sandbar": [("beach", 0.8)],
    "cave": [("cave", 1.0)],
    "fountain": [("city", 0.4), ("room", 0.2)],
    "crate": [("room", 0.3)],
    "studio couch": [("room", 0.8)],
    "bookcase": [("room", 0.8)],
    "lampshade": [("room", 0.7)],
    "cradle": [("room", 0.7)],
    "desk": [("room", 0.8)],
    "television": [("room", 0.7)],
    "dining table": [("room", 0.8)],
    "coffee mug": [("room", 0.6)],
    "shower curtain": [("room", 0.6)],
    "vacuum": [("room", 0.7)],
    "toaster": [("room", 0.6)],
    "refrigerator": [("room", 0.7)],
    "washer": [("room", 0.6)],
    "double door": [("room", 0.6)],
    "parking meter": [("road", 0.7)],
    "traffic light": [("road", 0.9)],
    "street sign": [("road", 0.9)],
    "limousine": [("road", 0.6), ("city", 0.5)],
    "monitor": [("room", 0.7)],
    "suspension bridge": [("road", 0.5), ("river", 0.6)],
    "freight car": [("road", 0.5)],
    "bicycle-built-for-two": [("road", 0.6)],
    "scooter": [("road", 0.6)],
    "moped": [("road", 0.6)],
    "jeep": [("road", 0.7), ("desert", 0.4)],
    "half track": [("desert", 0.5), ("road", 0.4)],
    "hay": [("grassland", 0.7)],
    "cowboy hat": [("grassland", 0.5), ("desert", 0.4)],
    "ox": [("grassland", 0.6)],
    "bison": [("grassland", 0.7)],
    "llama": [("grassland", 0.5), ("desert", 0.4)],
    "triceratops": [("jungle", 0.3)],
    "orangutan": [("jungle", 0.7), ("forest", 0.5)],
    "gorilla": [("jungle", 0.8), ("forest", 0.5)],
    "chimpanzee": [("jungle", 0.7)],
    "black grouse": [("forest", 0.5)],
    "marmot": [("forest", 0.5), ("mountain", 0.4)],
    "beaver": [("forest", 0.6)],
    "squirrel": [("forest", 0.7)],
    "leaf beetle": [("forest", 0.4), ("grassland", 0.4)],
    "dragonfly": [("river", 0.4), ("grassland", 0.3)],
    "bird nest": [("forest", 0.5)],
    "red-backed sandpiper": [("beach", 0.7), ("sea", 0.6)],
    "European gallinule": [("river", 0.5)],
    "bald eagle": [("mountain", 0.5), ("sky", 0.4)],
    "vulture": [("desert", 0.5), ("sky", 0.4)],
    "jellyfish": [("sea", 1.0)],
    "starfish": [("beach", 0.7), ("sea", 0.9)],
    "lorikeet": [("forest", 0.4)],
    "hummingbird": [("forest", 0.4)],
    "toucan": [("jungle", 0.8)],
    "macaw": [("jungle", 0.8)],
    "snowbird": [("snow", 0.7)],
    "cock": [("grassland", 0.4)],
    "sulphur-crested cockatoo": [("forest", 0.5)],
    "ringlet": [("grassland", 0.4)],
    "sea lion": [("beach", 0.8), ("sea", 0.7)],
    "otter": [("river", 0.6)],
    "axolotl": [("river", 0.6)],
    "tailed frog": [("river", 0.6)],
    "lion": [("grassland", 0.8), ("desert", 0.4)],
    "tiger": [("jungle", 0.7), ("forest", 0.4)],
    "zebra": [("grassland", 0.8)],
    "gazelle": [("grassland", 0.7)],
    "antelope": [("grassland", 0.7)],
    "white wolf": [("snow", 0.7), ("forest", 0.4)],
    "red fox": [("forest", 0.5)],
    "polar bear": [("snow", 0.9), ("sea", 0.4)],
    "brown bear": [("forest", 0.6)],
    "camel": [("desert", 0.9)],
    "Arabian camel": [("desert", 0.9)],
    "armadillo": [("desert", 0.5)],
    "rhinoceros beetle": [("forest", 0.3)],
    "elephant": [("grassland", 0.5), ("forest", 0.4), ("desert", 0.4)],
    "gibbon": [("jungle", 0.5)],
    "spider monkey": [("jungle", 0.6)],
    "kangaroo": [("grassland", 0.6)],
    "koala": [("forest", 0.6)],
    "panda": [("forest", 0.6)],
    "prairie chicken": [("grassland", 0.6)],
    "partridge": [("grassland", 0.5)],
    "quail": [("grassland", 0.5)],
    "indigo bunting": [("sky", 0.4)],
    "jay": [("forest", 0.5)],
    "robin": [("forest", 0.4)],
    "bulbul": [("forest", 0.4)],
    "skunk": [("forest", 0.4)],
    "badger": [("forest", 0.4)],
    "porcupine": [("forest", 0.4)],
    "ostrich": [("desert", 0.6), ("grassland", 0.5)],
    "emu": [("grassland", 0.5)],
    "golden retriever": [("room", 0.2)],
    "labrador": [("room", 0.2)],
    "sunflower": [("grassland", 0.5)],
    "daisy": [("grassland", 0.5)],
    "yellow lady's slipper": [("forest", 0.3)],
    "corn": [("grassland", 0.5)],
    "cucumber": [("grassland", 0.3)],
    "rapeseed": [("grassland", 0.4)],
    "mushroom": [("forest", 0.5)],
    "hen": [("grassland", 0.4)],
    "barn": [("grassland", 0.5)],
    "library": [("room", 0.9)],
    "castle": [("city", 0.8)],
    "tractor": [("road", 0.5), ("grassland", 0.6)],
    "golf ball": [("grassland", 0.9)],
    "cannon": [("city", 0.4)],
    "palace": [("city", 0.7)],
    "monastery": [("city", 0.6)],
    "lakeside": [("river", 0.6), ("sea", 0.5)],
    "dock": [("sea", 0.6), ("river", 0.5)],
    "lighthouse": [("sea", 0.8), ("beach", 0.6)],
    "breakwater": [("sea", 0.6)],
    "sand castle": [("beach", 0.9)],
}

# Scene synonyms -> canonical so queries like "beach" match "sea" isn't forced.
SCENE_SYNONYMS: Dict[str, str] = {
    "beach": "beach", "shore": "beach", "seashore": "beach", "sand": "beach",
    "sea": "sea", "ocean": "sea", "water": "sea", "river": "river",
    "creek": "river", "stream": "river", "lake": "river",
    "forest": "forest", "woods": "forest", "wood": "forest",
    "jungle": "jungle", "rainforest": "jungle",
    "room": "room", "indoor": "room", "inside": "room", "house": "room",
    "road": "road", "street": "road", "highway": "road",
    "mountain": "mountain", "hill": "mountain", "mountainous": "mountain",
    "snow": "snow", "snowy": "snow", "winter": "snow",
    "desert": "desert", "sand dune": "desert",
    "city": "city", "urban": "city", "town": "city",
    "cave": "cave", "cavern": "cave",
    "grassland": "grassland", "grass": "grassland", "field": "grassland",
    "meadow": "grassland", "prairie": "grassland",
    "sky": "sky", "skyline": "sky", "clouds": "sky", "cloud": "sky",
}


def normalize_scene(term: str) -> str:
    t = term.strip().lower()
    if not t:
        return ""
    if t in SCENE_SYNONYMS:
        return SCENE_SYNONYMS[t]
    # fuzzy contains
    for key, canon in SCENE_SYNONYMS.items():
        if key in t or t in key:
            return canon
    return t


class SceneClassifier:
    """Estimates scene using YOLO detections + ImageNet softmax mapping.

    A custom EfficientNet-B0 scene head can be supplied via
    ``backend/vision/models/scene_efficientnet.pt`` — if present this fallback
    path is skipped and the neural classifier is used instead. The companion
    ``scene_classes.json`` overrides the default taxonomy so user-trained classes
    are respected at runtime.
    """

    def __init__(self):
        self.model_name = "scene-estimator"
        self.device = "cpu"
        self._custom_model = None
        self._imagenet_index: Optional[Dict[int, str]] = None
        self._preprocess = None
        self._backbone = None
        self.classes = list(SCENE_CLASSES)
        self._try_load_custom()

    def _try_load_custom(self):
        classes_path = os.path.join(MODELS_DIR, "scene_classes.json")
        if os.path.exists(classes_path):
            try:
                with open(classes_path, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                if isinstance(payload, dict) and "classes" in payload and isinstance(payload["classes"], list):
                    self.classes = [str(c) for c in payload["classes"]]
                    logger.info("Loaded scene classes from %s: %s", classes_path, self.classes)
            except Exception as e:  # pragma: no cover
                logger.warning("Failed to read scene_classes.json: %s", e)
                self.classes = list(SCENE_CLASSES)

        if not os.path.exists(CUSTOM_SCENE_WEIGHTS):
            logger.info("No custom scene weights at %s — using fallback estimator", CUSTOM_SCENE_WEIGHTS)
            return
        try:
            import torch
            import torchvision.models as tvmodels
            from torchvision import transforms

            num_classes = len(self.classes)
            model = tvmodels.efficientnet_b0(weights=None)
            model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, num_classes)
            state = torch.load(CUSTOM_SCENE_WEIGHTS, map_location="cpu")
            if isinstance(state, dict) and "state_dict" in state:
                state = state["state_dict"]
            model.load_state_dict(state)
            model.eval()
            self._custom_model = model
            self.model_name = f"efficientnet-b0-scene ({num_classes} classes)"
            logger.info("Loaded custom scene model from %s (%d classes)", CUSTOM_SCENE_WEIGHTS, num_classes)
        except Exception as e:  # pragma: no cover
            logger.warning("Failed to load custom scene model: %s", e)
            self._custom_model = None

    def _imagenet_probs(self, image) -> Optional[Dict[int, float]]:
        """Return top-k ImageNet class index probabilities for an image."""
        try:
            import torch
            from torchvision import transforms
            if self._imagenet_index is None:
                from torchvision.models import EfficientNet_B0_Weights
                self._imagenet_index = EfficientNet_B0_Weights.IMAGENET1K_V1.meta["categories"]
            if self._preprocess is None:
                self._preprocess = transforms.Compose([
                    transforms.Resize(256),
                    transforms.CenterCrop(224),
                    transforms.ToTensor(),
                    transforms.Normalize(
                        mean=[0.485, 0.456, 0.406],
                        std=[0.229, 0.224, 0.225],
                    ),
                ])
            if self._backbone is None:
                import torchvision.models as tvmodels
                self._backbone = tvmodels.efficientnet_b0(
                    weights=tvmodels.EfficientNet_B0_Weights.IMAGENET1K_V1
                ).eval().to("cpu")
            import torch
            with torch.no_grad():
                x = self._preprocess(image).unsqueeze(0)
                out = torch.softmax(self._backbone(x), dim=1).squeeze(0)
                topk = torch.topk(out, k=50).indices.tolist()
            probs = {int(i): float(out[i]) for i in topk}
            return probs
        except Exception as e:  # pragma: no cover
            logger.debug("ImageNet backbone unavailable: %s", e)
            return None

    def _custom_predict(self, image) -> Optional[Dict[str, float]]:
        """Run the user-trained EfficientNet scene model, if loaded."""
        if self._custom_model is None or not self.classes:
            return None
        try:
            import torch
            from torchvision import transforms
            if self._preprocess is None:
                self._preprocess = transforms.Compose([
                    transforms.Resize(256),
                    transforms.CenterCrop(224),
                    transforms.ToTensor(),
                    transforms.Normalize(
                        mean=[0.485, 0.456, 0.406],
                        std=[0.229, 0.224, 0.225],
                    ),
                ])
            with torch.no_grad():
                x = self._preprocess(image.convert("RGB")).unsqueeze(0)
                out = torch.softmax(self._custom_model(x), dim=1).squeeze(0)
            return {self.classes[i]: float(out[i]) for i in range(len(self.classes))}
        except Exception as e:  # pragma: no cover
            logger.debug("Custom scene model inference failed: %s", e)
            return None

    def classify(self, image, detections: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Return normalized scene prediction dict.

        Args:
            image: PIL image
            detections: optional YOLO detections [{label, confidence}]
        """
        # 1) User-trained model has priority — BG Training output
        custom = self._custom_predict(image)
        if custom:
            ranked = sorted(custom.items(), key=lambda kv: kv[1], reverse=True)
            top_label, top_conf = ranked[0]
            return {
                "scene": top_label,
                "confidence": top_conf,
                "top": [{"label": k, "confidence": v} for k, v in ranked[:5]],
                "scores": dict(ranked),
            }

        scores: Dict[str, float] = {}
        detections = detections or []

        # 1) Detection-derived signal (strong, reliable)
        for det in detections:
            label = normalize_scene(det.get("label", ""))
            conf = det.get("confidence", 0.5)
            if label in SCENE_CLASSES:
                scores[label] = scores.get(label, 0.0) + conf
            # objects strongly hint at environments
            obj = det.get("label", "").lower()
            obj_hints = {
                "car": [("road", 0.6), ("city", 0.4)],
                "bus": [("road", 0.7), ("city", 0.3)],
                "truck": [("road", 0.6), ("city", 0.4)],
                "person": [("road", 0.2), ("room", 0.2), ("city", 0.2)],
                "cat": [("room", 0.3), ("grassland", 0.2)],
                "dog": [("room", 0.2), ("grassland", 0.3), ("beach", 0.2)],
                "horse": [("grassland", 0.6)],
                "bird": [("sky", 0.6), ("forest", 0.3)],
                "boat": [("sea", 0.7), ("river", 0.6), ("beach", 0.4)],
                "chair": [("room", 0.7)],
                "mouse": [("room", 0.5)],
                "sheep": [("grassland", 0.6)],
                "cow": [("grassland", 0.6)],
                "backpack": [("road", 0.3), ("mountain", 0.4)],
                "surfboard": [("beach", 0.8), ("sea", 0.6)],
                "skis": [("snow", 0.9)],
                "snowboard": [("snow", 0.9)],
            }
            for hint, pairs in obj_hints.items():
                if hint in obj:
                    for scene, w in pairs:
                        scores[scene] = scores.get(scene, 0.0) + conf * w

        # 2) ImageNet appearance signal (color/texture, no weights download needed
        #    because backbone is bundled; only loads when first requested)
        try:
            net_probs = self._imagenet_probs(image)
            if net_probs:
                from collections import Counter
                scene_agg: Dict[str, float] = {}
                for idx, prob in net_probs.items():
                    cat = self._imagenet_index.get(idx, "").lower()
                    for scene, w in IMAGENET_TO_SCENE.get(cat, []):
                        scene_agg[scene] = scene_agg.get(scene, 0.0) + prob * w
                for scene, score in scene_agg.items():
                    scores[scene] = max(scores.get(scene, 0.0), score * 0.6)
        except Exception as e:  # pragma: no cover
            logger.debug("ImageNet scene mapping skipped: %s", e)

        if not scores:
            # no reliable signal — return uniform low-confidence distribution
            # instead of faking certainty on a single class
            uniform = 1.0 / len(SCENE_CLASSES)
            scores = {c: uniform for c in SCENE_CLASSES}

        # Confidence should reflect signal strength, not relative rank only.
        # Compute a 0..1 confidence as normalized score but cap when raw signal
        # is weak (only the empty-uniform case gives a flat 100%).
        total = sum(scores.values()) or 1.0
        normalized = {k: v / total for k, v in scores.items()}
        ranked = sorted(normalized.items(), key=lambda kv: kv[1], reverse=True)
        top_label, top_conf = ranked[0]
        # If everything was equal (uniform fallback), drop confidence to reflect
        # that we are guessing rather than certain.
        if len(set(round(v, 3) for v in normalized.values())) <= 1:
            top_conf = round(1.0 / len(SCENE_CLASSES), 3)
        return {
            "scene": top_label,
            "confidence": top_conf,
            "top": [{"label": k, "confidence": v} for k, v in ranked[:5]],
            "scores": dict(ranked),
        }
