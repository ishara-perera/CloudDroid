"""Inspect official package metadata without downloading SDK binaries or accepting licenses."""
import json
import urllib.request
import xml.etree.ElementTree as ET

SOURCES = [("https://dl.google.com/android/repository/repository2-3.xml", "emulator"),
           ("https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-3.xml",
            "system-images;android-35;google_apis;x86_64")]


def main():
    result = []
    for url, package in SOURCES:
        with urllib.request.urlopen(url, timeout=30) as response:
            root = ET.fromstring(response.read())
        matches = []
        for element in root.iter():
            if element.tag.split("}")[-1] == "remotePackage" and element.get("path") == package:
                revision = element.find("revision")
                matches.append({"revision": {child.tag: child.text for child in revision},
                                "channel": element.find("channelRef").get("ref") if element.find("channelRef") is not None else "stable",
                                "archives": [n.text for n in element.findall("./archives/archive/complete/url")]})
        if not matches:
            raise SystemExit("Requested package was not found in official metadata: " + package)
        result.append({"source": url, "package": package, "releases": matches})
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
