"""Prepare repaired archival head plates for visual review before importing into the catalogue."""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from .portrait_edges import continue_plate, recover_original_crown, registered_face
from .portrait_processing import PortraitProcessor

ART = Path(__file__).resolve().parents[1] / "backend/art"


def hair_probability(processor, image):
    rgba = np.array(image.convert("RGBA").resize((240, 280)))
    alpha = rgba[:, :, 3:4] / 255
    rgb = np.uint8(rgba[:, :, :3] * alpha + 119 * (1 - alpha))
    masks = processor.skin.segment(processor.image(rgb)).confidence_masks
    return np.uint8(masks[1].numpy_view().copy().squeeze() * 255)


def transfer_hair(master, current, processor):
    """Register a complete studio plate, keeping original facial and neck pixels."""

    def landmarks(image):
        rgba = np.asarray(image)
        opacity = rgba[:, :, 3:] / 255
        rgb = np.uint8(rgba[:, :, :3] * opacity + 120 * (1 - opacity))
        faces = processor.faces.detect(processor.image(rgb)).face_landmarks
        if len(faces) != 1:
            raise ValueError("Expected one face in each source plate")
        landmarks = np.array(
            [(p.x * image.width, p.y * image.height) for p in faces[0]]
        )
        return landmarks[[1, 33, 133, 362, 263, 61, 291, 168, 4, 152]]

    origin, destination = landmarks(master), landmarks(current)
    transform, _ = cv2.estimateAffinePartial2D(origin, destination, method=cv2.LMEDS)
    if transform is None:
        raise ValueError("Unable to align studio sources")
    rgba = np.asarray(master)
    prob = cv2.resize(
        hair_probability(processor, master) / 255,
        master.size,
        interpolation=cv2.INTER_CUBIC,
    )
    # Suppress brightly coloured threads from the racing suit at the tips.
    chroma = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2LAB).astype(float)[:, :, 1:]
    sample = chroma[(prob > 0.94) & (rgba[:, :, 3] > 200)]
    if len(sample) < 20:
        raise ValueError("Source does not have a measurable hair region")
    delta = chroma - np.median(sample, axis=0)
    covariance = np.linalg.inv(np.cov(sample.T) + np.eye(2) * 6)
    distance = np.einsum("...i,ij,...j->...", delta, covariance, delta)
    opacity = (
        rgba[:, :, 3]
        / 255
        * np.clip((prob - 0.12) / 0.48, 0, 1)
        * np.clip((26 - distance) / 12, 0, 1)
    )
    premul = np.dstack((rgba[:, :, :3] * opacity[:, :, None], opacity)).astype(
        "float32"
    )
    moved = cv2.warpAffine(premul, transform, current.size)
    existing = np.asarray(current)
    hair = cv2.resize(hair_probability(processor, current) / 255, current.size)
    inside = cv2.distanceTransform(np.uint8(existing[:, :, 3] > 110), cv2.DIST_L2, 5)
    # Restrict the seam to hair on the perimeter, leaving central features intact.
    seam = hair[:, :, None] * np.clip((16 - inside[:, :, None]) / 16, 0, 1)
    old = existing[:, :, 3:] / 255 * (1 - seam * np.clip(moved[:, :, 3:] * 2, 0, 1))
    alpha = old + moved[:, :, 3:] * (1 - old)
    rgb = (existing[:, :, :3] * old + moved[:, :, :3] * (1 - old)) / np.maximum(
        alpha, 1e-8
    )
    return np.uint8(np.clip(np.dstack([rgb, alpha * 255]), 0, 255))


def restore_crown(current, reference, processor):
    """Replace an irrecoverable scalp silhouette above the brows on its original plate."""
    from .portrait_completion import photographed_face

    original, _, target = photographed_face(current, processor)
    restored, source, face = photographed_face(reference, processor)
    points = [33, 133, 362, 263, 1, 4, 98, 327, 61, 291]
    matrix, _ = cv2.estimateAffinePartial2D(
        face[points], target[points], method=cv2.LMEDS
    )
    if matrix is None:
        raise ValueError("Unable to register restored crown")
    masks = [
        p.numpy_view().copy().squeeze()
        for p in processor.skin.segment(source).confidence_masks
    ]
    coverage = np.clip((masks[1] + masks[3] + masks[2] - 0.08) / 0.78, 0, 1)
    photo = np.dstack((restored[:, :, :3] * coverage[:, :, None], coverage)).astype(
        "float32"
    )
    moved = cv2.warpAffine(photo, matrix, current.size)
    eye = np.linalg.norm(target[[33, 133]].mean(0) - target[[362, 263]].mean(0))
    brow = np.mean(target[[70, 105, 334, 300], 1])
    y = np.arange(current.height)[:, None]
    t = np.clip((brow - y - 0.12 * eye) / (0.42 * eye), 0, 1)
    weight = t * t * (3 - 2 * t)
    a = original[:, :, 3] / 255 * (1 - weight)
    b = moved[:, :, 3] * weight
    opacity = a + b
    rgb = (
        original[:, :, :3] * a[:, :, None] + moved[:, :, :3] * weight[:, :, None]
    ) / np.maximum(opacity[:, :, None], 1e-6)
    return Image.fromarray(np.uint8(np.clip(np.dstack((rgb, opacity * 255)), 0, 255)))


def remove_old_garment(current, processor):
    """Keep the original head, ears and neck when a complete hair donor is available."""
    rgba = np.asarray(current).copy()
    alpha = rgba[:, :, 3:] / 255
    rgb = np.uint8(rgba[:, :, :3] * alpha + 119 * (1 - alpha))
    image = processor.image(rgb)
    masks = [
        m.numpy_view().squeeze().copy()
        for m in processor.skin.segment(image).confidence_masks
    ]
    landmarks = processor.faces.detect(image).face_landmarks
    if len(landmarks) != 1:
        raise ValueError("Missing face in previously registered replacement")
    face = np.array([(q.x * current.width, q.y * current.height) for q in landmarks[0]])
    eye = np.linalg.norm(face[[33, 133]].mean(0) - face[[362, 263]].mean(0))
    chin = face[152, 1]
    yy = np.arange(current.height)[:, None]
    head = np.clip((chin + 0.18 * eye - yy) / (0.22 * eye), 0, 1)
    skin = np.clip((masks[2] + masks[3] - 0.12) / 0.52, 0, 1)
    rgba[:, :, 3] = np.rint(rgba[:, :, 3] * np.maximum(head, skin))
    return Image.fromarray(rgba)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        type=Path,
        help="Earliest archived transparent plates, in catalogue layout",
    )
    parser.add_argument(
        "output", type=Path, help="Directory for proposed repairs and the audit index"
    )
    parser.add_argument(
        "--restored",
        type=Path,
        help="Optional complete studio plates named by asset ID",
    )
    args = parser.parse_args()
    if args.output.resolve() in (ART.resolve(), args.source.resolve()):
        parser.error("Write candidates to a separate review directory")
    args.output.mkdir(parents=True, exist_ok=True)
    reg = json.loads((ART / "wardrobe/registration.json").read_text())
    findings = {}
    processor = PortraitProcessor()
    try:
        for catalogue in (ART / "catalog.json", ART / "junior/catalog.json"):
            for asset in json.loads(catalogue.read_text()):
                if asset["kind"] != "generated-head":
                    continue
                path = Path(asset["path"])
                original = Image.open(args.source / path).convert("RGBA")
                current = Image.open(ART / path).convert("RGBA")
                if original.size != current.size:
                    raise ValueError(f"Unregistered source dimensions for {path}")
                width, height = original.size
                center, chin, eye = reg[asset["entity"]]["anchor"]
                master = (
                    args.restored / (asset["entity"] + ".png")
                    if args.restored
                    else None
                )
                if not registered_face(
                    np.asarray(original),
                    np.asarray(current),
                    center * width / 240,
                    chin * height / 280,
                    eye * width / 240,
                ):
                    findings[asset["entity"]] = {
                        "archive": "missing or unregistered face"
                    }
                    if master and master.is_file():
                        result = transfer_hair(
                            Image.open(master).convert("RGBA"),
                            remove_old_garment(current, processor),
                            processor,
                        )
                        Image.fromarray(result).save(
                            args.output / (asset["entity"] + ".png")
                        )
                    continue
                hair = cv2.resize(
                    hair_probability(processor, original), (width, height)
                )
                proposal, edges = continue_plate(
                    np.asarray(original),
                    np.asarray(current),
                    hair.astype("float32") / 255,
                    eye * width / 240,
                    center * width / 240,
                )
                proposal, recovered = recover_original_crown(
                    np.asarray(original),
                    proposal,
                    chin * height / 280,
                    eye * width / 240,
                )
                if recovered:
                    edges["surviving-source"] = recovered
                if master and master.is_file():
                    proposal = transfer_hair(
                        Image.open(master).convert("RGBA"), current, processor
                    )
                crown = (
                    args.restored / (asset["entity"] + ".crown.webp")
                    if args.restored
                    else None
                )
                if crown and crown.is_file():
                    proposal = np.asarray(
                        restore_crown(
                            Image.fromarray(proposal), Image.open(crown), processor
                        )
                    )
                    edges["restored-crown"] = True
                if edges or (master and master.is_file()):
                    Image.fromarray(proposal).save(
                        args.output / (asset["entity"] + ".png")
                    )
                findings[asset["entity"]] = edges
    finally:
        processor.close()
    (args.output / "edges.json").write_text(json.dumps(findings, indent=2) + "\n")


if __name__ == "__main__":
    cv2.setNumThreads(1)
    main()
