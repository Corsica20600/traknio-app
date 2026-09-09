"""Inspect the actual Wear AAB (not source Gradle values) before delivery.

python scripts/audit-wear-bundle.py BUNDLE --bundletool PATH --version-code 29
Requires Python, Java and Google's bundletool-all.jar; no Python dependencies.
"""
import argparse
import hashlib
import json
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ANDROID = "{http://schemas.android.com/apk/res/android}"


def elf_segments(data):
    assert data[:4] == b"\x7fELF", "Native library is not ELF"
    assert data[5] == 1, "Unexpected ELF endianness"
    is64 = data[4] == 2
    offset = struct.unpack_from("<Q" if is64 else "<I", data, 32 if is64 else 28)[0]
    size, count = struct.unpack_from("<HH", data, 54 if is64 else 42)
    loads = []
    relro = False
    for index in range(count):
        entry = offset + index * size
        kind = struct.unpack_from("<I", data, entry)[0]
        relro |= kind == 0x6474E552
        if kind == 1:
            alignment = struct.unpack_from("<Q" if is64 else "<I", data, entry + (48 if is64 else 28))[0]
            loads.append(alignment)
    assert loads, "ELF has no LOAD segments"
    return {"bits": 64 if is64 else 32, "load_alignments": loads, "gnu_relro": relro}


def inspect(bundle, bundletool, version):
    def run(*args):
        return subprocess.check_output(["java", "-jar", str(bundletool), *args], encoding="utf-8")

    run("validate", f"--bundle={bundle}")
    manifest_text = run("dump", "manifest", f"--bundle={bundle}", "--module=base")
    manifest = ET.fromstring(manifest_text)
    config = json.loads(run("dump", "config", f"--bundle={bundle}"))
    sdk = manifest.find("uses-sdk")
    application = manifest.find("application")
    permissions = sorted(node.attrib[ANDROID + "name"] for node in manifest.findall("uses-permission"))
    checks = {
        "package": manifest.get("package") == "com.traknio.app",
        "version_code": manifest.get(ANDROID + "versionCode") == str(version),
        "version_name": manifest.get(ANDROID + "versionName") == "0.5.8",
        "target_sdk": int(sdk.get(ANDROID + "targetSdkVersion", "0")) >= 35,
        "watch_required": any(n.get(ANDROID + "name") == "android.hardware.type.watch" and
                              n.get(ANDROID + "required") == "true" for n in manifest.findall("uses-feature")),
        "non_standalone": any(n.get(ANDROID + "name") == "com.google.android.wearable.standalone" and
                              n.get(ANDROID + "value") == "false" for n in application.findall("meta-data")),
        "no_steps": not any("STEPS" in p.upper() or "CADENCE" in p.upper() for p in permissions),
        "no_xr": "android.software.xr" not in manifest_text,
    }
    native = []
    with zipfile.ZipFile(bundle) as archive:
        for name in archive.namelist():
            if name.endswith(".so"):
                data = archive.read(name)
                native.append({"path": name, "sha256": hashlib.sha256(data).hexdigest(), **elf_segments(data)})
        checks["jar_signature_present"] = any(n.upper().endswith((".RSA", ".EC", ".DSA")) for n in archive.namelist())
    paths = {item["path"] for item in native}
    checks["abi_parity"] = all(
        name.replace("/armeabi-v7a/", "/arm64-v8a/").replace("/x86/", "/x86_64/") in paths
        for name in paths
    )
    checks["elf_16k"] = all(all(alignment >= 16384 for alignment in item["load_alignments"]) for item in native)
    checks["gnu_relro"] = all(item["gnu_relro"] for item in native)
    checks["zip_16k"] = not native or "PAGE_ALIGNMENT_16K" in json.dumps(config)
    if version >= 29:
        checks["notification_permission"] = "android.permission.POST_NOTIFICATIONS" in permissions
        checks["target35_sensor_permission"] = "android.permission.BODY_SENSORS" in permissions
        checks["launcher_single_top"] = any(n.get(ANDROID + "name") == "com.traknio.watch.MainActivity" and
                                            n.get(ANDROID + "launchMode") in {"singleTop", "1"} for n in application.findall("activity"))
    return {
        "bundle": str(bundle), "sha256": hashlib.sha256(bundle.read_bytes()).hexdigest(),
        "version_code": manifest.get(ANDROID + "versionCode"), "version_name": manifest.get(ANDROID + "versionName"),
        "min_sdk": sdk.get(ANDROID + "minSdkVersion"), "target_sdk": sdk.get(ANDROID + "targetSdkVersion"),
        "permissions": permissions, "native_libraries": native, "checks": checks,
        "static_checks_passed": all(checks.values()),
        "limitations": "Signature presence is not cryptographic verification. Installation, Ongoing Activity, UI and sensor lifecycle need device tests.",
        "manifest": manifest_text, "bundle_config": config,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--bundletool", required=True, type=Path)
    parser.add_argument("--version-code", required=True, type=int)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = inspect(args.bundle, args.bundletool, args.version_code)
    serialized = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(serialized + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k not in {"manifest", "bundle_config"}}, indent=2, ensure_ascii=False))
    raise SystemExit(0 if result["static_checks_passed"] else 1)
