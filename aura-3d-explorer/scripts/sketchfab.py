#!/usr/bin/env python3
"""Source Sketchfab candidates and download selected archives using official APIs."""
import argparse
import json
import os
from pathlib import Path
import re
import tempfile
import struct
import zipfile
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src/content/sketchfab-models.json"
API = "https://api.sketchfab.com/v3"
QUERIES = {
    "sofas": "modern sofa", "chairs": "lounge chair", "tables": "coffee table",
    "beds": "modern bed", "skylines": "city skyline", "buildings": "low poly building",
    "trees": "low poly tree", "plants": "potted plant", "street": "park bench",
    "vehicles": "low poly car",
}
ALLOWED_LICENSES = {"by", "cc0"}


def request_json(path, token=None):
    headers = {"Accept": "application/json", "User-Agent": "AURA-model-sourcing/1.0"}
    if token:
        scheme = os.environ.get("SKETCHFAB_AUTH_TYPE", "Bearer")
        if scheme not in {"Bearer", "Token"}:
            raise RuntimeError("SKETCHFAB_AUTH_TYPE must be Bearer or Token")
        headers["Authorization"] = f"{scheme} {token}"
    try:
        with urlopen(Request(API + path, headers=headers), timeout=40) as response:
            return json.load(response)
    except HTTPError as error:
        # Never print request headers, access tokens, or temporary download URLs.
        raise RuntimeError(f"Sketchfab returned HTTP {error.code} for {path.split('?')[0]}") from None


def source():
    from datetime import datetime, timezone
    licenses = {item["uri"].rsplit("/", 1)[-1]: item for item in request_json("/licenses")["results"]}
    models = []
    seen = set()
    for category, query in QUERIES.items():
        payload = request_json("/search?" + urlencode({
            "type": "models", "q": query, "downloadable": "true", "count": 24,
        }))
        candidates = []
        for model in payload["results"]:
            if category == "skylines" and "cities skylines" in model["name"].lower():
                continue  # Game-specific vehicle/prop uploads are not skyline geometry.
            if re.search(r"minecraft|hospital|anten[n]?a|futuristic|painted style", model["name"], re.I):
                continue
            license_info = licenses.get(model.get("license", {}).get("uid"), {})
            archive = model.get("archives", {}).get("glb") or model.get("archives", {}).get("gltf")
            if (not model.get("isDownloadable") or model.get("isAgeRestricted")
                    or license_info.get("slug") not in ALLOWED_LICENSES or not archive):
                continue
            size, faces = archive.get("size"), model.get("faceCount")
            # Budget for a candidate, not a guarantee of runtime performance.
            if not isinstance(size, int) or not isinstance(faces, int) or size > 50_000_000 or faces > 150_000:
                continue
            candidates.append((size, faces, model, license_info))
        count = 0
        for size, faces, model, license_info in sorted(candidates, key=lambda item: (item[0], item[1])):
            if model["uid"] in seen:
                continue
            seen.add(model["uid"])
            images = model.get("thumbnails", {}).get("images", [])
            thumbnail = min(images, key=lambda image: abs(image["width"] - 720))["url"] if images else None
            models.append({
                "uid": model["uid"], "name": model["name"], "category": category,
                "query": query, "url": model["viewerUrl"], "thumbnail": thumbnail,
                "creator": {"name": model["user"]["displayName"], "url": model["user"]["profileUrl"]},
                "license": {key: license_info[key] for key in ("label", "slug", "url", "requirements")},
                "faceCount": faces, "archiveBytes": size,
                "formats": sorted(set(model["archives"]) & {"glb", "gltf", "usdz"}),
                "status": "candidate-not-downloaded",
            })
            count += 1
            if count == 3:
                break
        print(f"{category}: {count} candidates")
    CATALOG.write_text(json.dumps({"source": "Sketchfab Data API v3", "checkedAt": datetime.now(timezone.utc).isoformat(), "models": models}, indent=2) + "\n")
    print(f"Saved {len(models)} candidates to {CATALOG.relative_to(ROOT)}")


def download(uid, preferred_format=None):
    if not re.fullmatch(r"[a-f0-9]{32}", uid):
        raise RuntimeError("Expected a 32-character Sketchfab model UID")
    token = os.environ.get("SKETCHFAB_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("Set SKETCHFAB_ACCESS_TOKEN to your Sketchfab OAuth access token locally; do not commit it.")
    catalog = json.loads(CATALOG.read_text())
    candidate = next((model for model in catalog["models"] if model["uid"] == uid), None)
    if not candidate:
        raise RuntimeError("Choose a UID from src/content/sketchfab-models.json")
    current = request_json(f"/models/{uid}")
    licenses = request_json("/licenses")["results"]
    model_license = current.get("license", {})
    license_uid = model_license.get("uid") or model_license.get("uri", "").rsplit("/", 1)[-1]
    license_info = next((item for item in licenses if item["uri"].endswith("/" + license_uid)), {}) if license_uid else {}
    if not current.get("isDownloadable") or license_info.get("slug") not in ALLOWED_LICENSES:
        raise RuntimeError("Model is no longer downloadable under CC BY or CC0; refresh the catalog.")
    response = request_json(f"/models/{uid}/download", token)
    formats = (preferred_format,) if preferred_format else ("glb", "gltf")
    fmt = next((key for key in formats if response.get(key, {}).get("url")), None)
    if not fmt:
        raise RuntimeError("Sketchfab did not provide a GLB or glTF download")
    url = response[fmt]["url"]
    if urlparse(url).scheme != "https":
        raise RuntimeError("Download URL must use HTTPS")
    folder = ROOT / "model-downloads" / uid
    folder.mkdir(parents=True, exist_ok=True)
    limit = 100_000_000
    temp = None
    try:
        # Separate request: the OAuth token is never sent to the archive host.
        with urlopen(url, timeout=60) as stream, tempfile.NamedTemporaryFile(dir=folder, delete=False) as output:
            temp = Path(output.name)
            total = 0
            while chunk := stream.read(1024 * 1024):
                total += len(chunk)
                if total > limit:
                    raise RuntimeError("Archive exceeds the 100 MB download limit")
                output.write(chunk)
        magic = temp.open("rb")
        with magic:
            header = magic.read(4)
        extension = ".glb" if header == b"glTF" else ".zip" if header[:2] == b"PK" else None
        if extension is None:
            raise RuntimeError("Unexpected archive format; no model saved")
        target = folder / ("model" + extension)
        temp.replace(target)
        credit = {**candidate, "name": current["name"], "url": current["viewerUrl"],
                  "creator": {"name": current["user"]["displayName"], "url": current["user"]["profileUrl"]},
                  "license": {key: license_info[key] for key in ("label", "slug", "url", "requirements")},
                  "status": "downloaded-unreviewed", "file": target.name, "modifications": "None"}
        (folder / "attribution.json").write_text(json.dumps(credit, indent=2) + "\n")
        print(f"Saved {target.relative_to(ROOT)} with attribution.json")
    finally:
        if temp and temp.exists():
            temp.unlink()


def install(uid, size, rotation, max_bytes=50_000_000):
    """Activate a locally downloaded, self-contained GLB with its attribution."""
    import math
    if max_bytes not in {50_000_000, 100_000_000}:
        raise RuntimeError("Model budget must be 50 or 100 MB")
    if not re.fullmatch(r"[a-f0-9]{32}", uid):
        raise RuntimeError("Expected a 32-character Sketchfab model UID")
    if size is None or not math.isfinite(size) or not 0.05 <= size <= 2000:
        raise RuntimeError("install requires --size METRES (longest model dimension, 0.05–2000)")
    if not math.isfinite(rotation):
        raise RuntimeError("Rotation must be finite degrees")
    folder = ROOT / "model-downloads" / uid
    credit = json.loads((folder / "attribution.json").read_text())
    if credit["uid"] != uid or credit["license"]["slug"] not in ALLOWED_LICENSES:
        raise RuntimeError("Attribution must match the model and use CC BY or CC0")
    source_path = folder / "model.glb"
    if source_path.exists():
        if source_path.stat().st_size > max_bytes:
            raise RuntimeError(f"Installed GLB must be below {max_bytes // 1_000_000} MB")
        data = source_path.read_bytes()
    else:
        with zipfile.ZipFile(folder / "model.zip") as archive:
            candidates = [item for item in archive.infolist() if item.filename.lower().endswith(".glb")]
            if len(candidates) != 1 or candidates[0].file_size > max_bytes:
                raise RuntimeError(f"Archive must contain one GLB below {max_bytes // 1_000_000} MB; convert glTF to a self-contained model.glb first")
            # Read one entry directly, never extract untrusted paths.
            data = archive.read(candidates[0])
    validate_glb(data)
    destination = ROOT / "public/models/sketchfab" / uid
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "model.glb").write_bytes(data)
    record = {key: credit[key] for key in ("uid", "name", "category", "url", "creator", "license")}
    record.update(path=f"/models/sketchfab/{uid}/model.glb", sizeMeters=size,
                  rotationY=math.radians(rotation), modifications="Centered, grounded, uniformly scaled and rotated for AURA")
    (destination / "attribution.json").write_text(json.dumps(record, indent=2) + "\n")
    manifest = ROOT / "src/content/installed-models.json"
    installed = json.loads(manifest.read_text())
    installed = [item for item in installed if item["uid"] != uid] + [record]
    manifest.write_text(json.dumps(installed, indent=2) + "\n")
    print(f"Installed {record['name']}. Restart/rebuild AURA, then verify orientation and size in the scene.")


def validate_glb(data):
    if len(data) < 20:
        raise RuntimeError("Truncated GLB")
    magic, version, length, chunk_size, chunk_type = struct.unpack_from("<4sIIII", data)
    if magic != b"glTF" or version != 2 or length != len(data) or chunk_type != 0x4E4F534A or chunk_size > len(data) - 20:
        raise RuntimeError("Invalid GLB 2.0 header")
    document = json.loads(data[20:20 + chunk_size])
    for resource in document.get("buffers", []) + document.get("images", []):
        if resource.get("uri") and not resource["uri"].startswith("data:"):
            raise RuntimeError("Models must embed all buffers and images; external resource URLs are not allowed")
    # Do not silently fetch decoders or unsupported compressed textures from CDNs.
    unsupported = {"KHR_draco_mesh_compression", "KHR_texture_basisu", "EXT_meshopt_compression"}
    if unsupported.intersection(document.get("extensionsUsed", [])):
        raise RuntimeError("Decode compressed geometry/textures into a standard GLB before installation")
    if not document.get("meshes") or not document.get("scenes"):
        raise RuntimeError("GLB must contain meshes and a scene")


if __name__ == "__main__":
    # Parse only our settings; never execute a shell file or expose its contents.
    env_file = ROOT / ".env.local"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            key, separator, value = line.partition("=")
            if separator and key.strip() in {"SKETCHFAB_ACCESS_TOKEN", "SKETCHFAB_AUTH_TYPE"}:
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["source", "download", "install"])
    parser.add_argument("uid", nargs="?")
    parser.add_argument("--size", type=float, help="Longest model dimension in metres (install)")
    parser.add_argument("--rotation", type=float, default=0, help="Y rotation in degrees (install)")
    parser.add_argument("--max-mb", type=int, choices=[50, 100], default=50, help="Explicit install size budget; 100 for large city districts")
    parser.add_argument("--format", choices=["glb", "gltf"], help="Download format; glTF archives may contain higher-resolution textures than GLB")
    args = parser.parse_args()
    try:
        if args.command == "source":
            source()
        elif args.uid:
            if args.command == "download":
                download(args.uid, args.format)
            else:
                install(args.uid, args.size, args.rotation, args.max_mb * 1_000_000)
        else:
            parser.error("download/install requires a model UID")
    except (RuntimeError, OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
