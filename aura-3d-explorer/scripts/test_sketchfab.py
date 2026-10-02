"""Run with python3 -m unittest discover -s scripts -p 'test_sketchfab.py'."""
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import sketchfab


def glb(**changes):
    document = {"asset": {"version": "2.0"}, "meshes": [{"primitives": []}], "scenes": [{"nodes": []}], **changes}
    data = json.dumps(document).encode()
    data += b" " * (-len(data) % 4)
    return struct.pack("<4sIIII", b"glTF", 2, len(data) + 20, len(data), 0x4E4F534A) + data


class ModelInstallTests(unittest.TestCase):
    def test_self_contained_glb(self):
        sketchfab.validate_glb(glb())

    def test_rejects_external_resources(self):
        for uri in ("https://example.com/texture.jpg", "../texture.jpg", "/etc/passwd"):
            with self.subTest(uri=uri), self.assertRaises(RuntimeError):
                sketchfab.validate_glb(glb(images=[{"uri": uri}]))

    def test_rejects_remote_decoder_dependency(self):
        with self.assertRaises(RuntimeError):
            sketchfab.validate_glb(glb(extensionsUsed=["KHR_draco_mesh_compression"]))

    def test_rejects_truncation(self):
        for data in (b"glTF", glb()[:-1]):
            with self.assertRaises(RuntimeError):
                sketchfab.validate_glb(data)

    def test_install_registers_file_and_attribution_once(self):
        uid = "a" * 32
        with tempfile.TemporaryDirectory() as directory, patch.object(sketchfab, "ROOT", Path(directory)):
            root = Path(directory)
            folder = root / "model-downloads" / uid
            folder.mkdir(parents=True)
            (root / "src/content").mkdir(parents=True)
            manifest = root / "src/content/installed-models.json"
            manifest.write_text("[]")
            (folder / "model.glb").write_bytes(glb())
            credit = {"uid": uid, "name": "Test", "category": "sofas", "url": "https://sketchfab.com/test",
                      "creator": {"name": "Author", "url": "https://sketchfab.com/author"},
                      "license": {"slug": "by", "label": "CC Attribution", "url": "https://creativecommons.org/licenses/by/4.0/"}}
            (folder / "attribution.json").write_text(json.dumps(credit))
            sketchfab.install(uid, 2.4, 90)
            sketchfab.install(uid, 2.4, 90)
            models = json.loads(manifest.read_text())
            self.assertEqual(len(models), 1)
            self.assertEqual(models[0]["creator"], credit["creator"])
            self.assertTrue((root / "public" / models[0]["path"].lstrip("/")).is_file())

    def test_install_rejects_path_and_nonfinite_size(self):
        with self.assertRaises(RuntimeError):
            sketchfab.install("../escape", 2.4, 0)
        with self.assertRaises(RuntimeError):
            sketchfab.install("a" * 32, float("nan"), 0)


if __name__ == "__main__":
    unittest.main()
