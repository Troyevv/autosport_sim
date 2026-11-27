"""Offline geometric quality checks and semantic head/neck segmentation.

The offline artist workflow fits authored synthetic studio faces to team clothing.
"""

import hashlib
import math
from io import BytesIO
from pathlib import Path


class Unsuitable(ValueError):
    pass


VERSION = "studio-v2"
MODELS = Path(__file__).with_name("data") / "portrait-models"
DIGESTS = {
    "face_landmarker.task": "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
    "selfie_multiclass.tflite": "c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0",
}


class PortraitProcessor:
    def __init__(self):
        import mediapipe as mp
        from mediapipe.tasks.python import vision

        self.mp = mp

        def model(name):
            data = (MODELS / name).read_bytes()
            if hashlib.sha256(data).hexdigest() != DIGESTS[name]:
                raise RuntimeError("Повреждена локальная модель " + name)
            return mp.tasks.BaseOptions(model_asset_buffer=data)

        self.faces = vision.FaceLandmarker.create_from_options(
            vision.FaceLandmarkerOptions(
                base_options=model("face_landmarker.task"),
                num_faces=3,
                output_face_blendshapes=True,
                min_face_detection_confidence=0.65,
            )
        )
        try:
            self.skin = vision.ImageSegmenter.create_from_options(
                vision.ImageSegmenterOptions(
                    base_options=model("selfie_multiclass.tflite"),
                    output_confidence_masks=True,
                )
            )
        except Exception:
            self.faces.close()
            raise

    def close(self):
        self.faces.close()
        self.skin.close()

    def image(self, array):
        import numpy as np

        return self.mp.Image(
            image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(array)
        )

    def render(self, raw):
        return self._render(raw, studio=False)[0]

    def render_roster(self, raw):
        """For reviewed studio roster sources, also return the natural display width."""
        return self._render(raw, studio=True)

    def _render(self, raw, studio, register=None):
        import cv2
        import numpy as np
        from PIL import Image, ImageOps, UnidentifiedImageError

        try:
            with Image.open(BytesIO(raw)) as im:
                if (
                    im.format not in ("JPEG", "PNG", "WEBP")
                    or im.width * im.height > 24_000_000
                ):
                    raise Unsuitable("Неподходящий формат или размер")
                im = ImageOps.exif_transpose(im).convert("RGBA")
                im.thumbnail((1400, 1400))
                original = np.asarray(im)
        except (OSError, UnidentifiedImageError, Image.DecompressionBombError) as e:
            raise Unsuitable("Изображение не читается") from e
        if min(original.shape[:2]) < 300:
            raise Unsuitable("Недостаточное разрешение")
        if studio and original[:, :, 3].min() != 0:
            raise Unsuitable("Нет прозрачного студийного исходника")
        # Flatten transparent studio backgrounds to middle gray for the two models.
        rgba = original.astype(np.float32) / 255
        rgb = np.uint8(
            (rgba[:, :, :3] * rgba[:, :, 3:] + 0.61 * (1 - rgba[:, :, 3:])) * 255
        )
        h, w = rgb.shape[:2]
        detected = self.faces.detect(self.image(rgb))
        if len(detected.face_landmarks) != 1:
            raise Unsuitable("Требуется одно видимое лицо")
        lm = np.array([(p.x * w, p.y * h) for p in detected.face_landmarks[0]])
        left = lm[[33, 133]].mean(0)
        right = lm[[362, 263]].mean(0)
        eyes = (left + right) / 2
        delta = right - left
        span = float(np.linalg.norm(delta))
        chin = lm[152]
        # Estimate native portrait width from the distance between the eyes.
        native_width = math.floor(span * 480 / 78)
        if span < 45 and (not studio or native_width < 160):
            raise Unsuitable("Лицо слишком мало в кадре")
        if (
            abs(math.degrees(math.atan2(delta[1], delta[0]))) > 9
            or abs(lm[1, 0] - eyes[0]) / span > 0.22
        ):
            raise Unsuitable("Разворот или наклон головы")
        if not 0.83 < (chin[1] - eyes[1]) / span < 2.05:
            raise Unsuitable("Наклон головы относительно камеры")
        expression = {b.category_name: b.score for b in detected.face_blendshapes[0]}
        if (
            max(
                expression.get(k, 0)
                for k in ("jawOpen", "mouthSmileLeft", "mouthSmileRight")
            )
            > 0.78
        ):
            raise Unsuitable("Требуется нейтральное выражение")
        if studio:
            # Measure the original face, excluding silhouette edges and jersey detail.
            face = rgb[
                max(0, int(eyes[1] - 0.35 * span)) : min(h, int(chin[1] - 0.2 * span)),
                max(0, int(eyes[0] - 0.75 * span)) : min(w, int(eyes[0] + 0.75 * span)),
            ]
            if not face.size:
                raise Unsuitable("Лицо за границей кадра")
            gray = cv2.cvtColor(face, cv2.COLOR_RGB2GRAY)
            if np.std(gray) < 12 or cv2.Laplacian(gray, cv2.CV_64F).var() < 70:
                raise Unsuitable("Недостаточная детализация лица")
        # Segment in the source photograph. An eye-distance window removes precisely
        # the evidence needed to distinguish wide hair from a cut-off studio plate.
        results = self.skin.segment(self.image(rgb))
        probs = [m.numpy_view().copy().squeeze() for m in results.confidence_masks]
        rows, cols = np.ogrid[:h, :w]
        central = np.abs(cols - chin[0]) / span
        neck = (
            (central < 0.96)
            & (rows > eyes[1] + 0.42 * span)
            & (rows < chin[1] + 1.26 * span)
        )
        ears = (
            (central > 0.68)
            & (central < 1.48)
            & (rows > eyes[1] - 0.58 * span)
            & (rows < eyes[1] + 0.65 * span)
        )
        if ears.any() and np.mean(probs[5][ears] > 0.6) > 0.13:
            raise Unsuitable("Предмет закрывает уши или лицо")
        conf = probs[1] + probs[3] + probs[2] * neck
        alpha = np.clip((conf - 0.15) / 0.73, 0, 1) * rgba[:, :, 3]
        # Retain only the head attached to the nose, discard detached hands/people.
        _, labels = cv2.connectedComponents(np.uint8(alpha > 0.18))
        ny, nx = np.rint(lm[1]).astype(int)[::-1]
        if (
            not (0 <= ny < labels.shape[0] and 0 <= nx < labels.shape[1])
            or not labels[ny, nx]
        ):
            raise Unsuitable("Не удалось выделить лицо")
        component = np.uint8(labels == labels[ny, nx])
        alpha *= cv2.dilate(component, np.ones((3, 3), np.uint8))
        visible_hair = (probs[1] > 0.34) & (alpha > 0.22)
        # A shaved scalp may be classified wholly as skin. Retain the legacy
        # rejection of a clipped crown even when no hair pixels are present.
        visible_head = (component > 0) & (rows < chin[1] - 0.35 * span)
        for side, border in zip(
            ("слева", "справа", "сверху", "снизу"),
            (
                (visible_hair | visible_head)[:, 0],
                (visible_hair | visible_head)[:, -1],
                (visible_hair | visible_head)[0],
                visible_hair[-1],
            ),
            strict=True,
        ):
            if border.sum() >= max(2, round(0.06 * span)):
                raise Unsuitable("Исходная причёска обрезана " + side)

        # Fit the rotated silhouette, including hair below the chin. Preserve the
        # camera convention for existing consumers and leave room for the collar.
        angle = math.degrees(math.atan2(delta[1], delta[0]))
        rotation = cv2.getRotationMatrix2D(tuple(eyes), angle, 1.0)
        outline = cv2.findNonZero(np.uint8(alpha > 0.12))
        hull = cv2.convexHull(outline).astype(np.float32)
        points = cv2.transform(hull, rotation).reshape(-1, 2) - eyes
        leftmost, top = points.min(axis=0)
        rightmost, bottom = points.max(axis=0)
        scale = min(
            78 / span,
            230 / max(-leftmost, rightmost, 1),
            146 / max(-top, 1),
            392 / max(bottom, 1),
        )
        mat = cv2.getRotationMatrix2D(tuple(eyes), angle, scale)
        mat[:, 2] += np.array([240, 156]) - eyes
        if register is not None:
            register(original, rgb, lm, mat.copy())
        color = rgb.astype(np.float32) * alpha[:, :, None]
        output = cv2.warpAffine(
            np.dstack([color, alpha]), mat, (480, 560), flags=cv2.INTER_LINEAR
        )
        a = output[:, :, 3]
        if any(edge.max() > 0.5 for edge in (a[0], a[-1], a[:, 0], a[:, -1])):
            raise Unsuitable("Силуэт выходит за поля готового портрета")
        # Validate skin in anatomical coordinates. A wide hairstyle can demand a
        # smaller photograph on the same canvas without changing the person's neck.
        throat = np.rint(chin + [0, 0.36 * span]).astype(int)
        if not (
            0 <= throat[1] < h
            and 0 <= throat[0] < w
            and alpha[throat[1], throat[0]] > 0.60
        ):
            raise Unsuitable("Шея не доходит до воротника")
        output[:, :, :3] /= np.maximum(a[:, :, None], 0.001)
        output[:, :, 3] *= 255
        dst = BytesIO()
        Image.fromarray(np.uint8(np.clip(output, 0, 255))).save(
            dst, format="PNG", optimize=True
        )
        return dst.getvalue(), native_width
