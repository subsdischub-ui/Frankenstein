"""Livrer les sources sur une NOUVELLE branche GitHub, sans token manipulé ni merge."""
import argparse
import base64
import hashlib
import json
import pathlib
import re
import subprocess
import zipfile

REPO = "subsdischub-ui/Frankenstein"
ROOT = pathlib.Path(__file__).resolve().parents[2]


def api(endpoint, body=None):
    command = ["gh", "api", f"repos/{REPO}/{endpoint}",
               "-H", "X-GitHub-Api-Version: 2022-11-28"]
    if body is not None:
        command += ["--method", "POST", "--input", "-"]
    result = subprocess.run(
        command, input=json.dumps(body) if body is not None else None,
        text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout)


def publish(branch):
    if not re.fullmatch(r"dokploy-paper(?:-[a-zA-Z0-9-]+)?", branch):
        raise ValueError("Branche autorisée : dokploy-paper ou dokploy-paper-SUFFIXE.")
    matches = api(f"git/matching-refs/heads/{branch}")
    if any(item["ref"] == f"refs/heads/{branch}" for item in matches):
        raise ValueError("Cette branche existe déjà. Choisir un nouveau suffixe ; aucun écrasement.")
    base = api("git/ref/heads/main")["object"]["sha"]
    base_tree = api(f"git/commits/{base}")["tree"]["sha"]
    subprocess.run(["node", str(ROOT / "deployment/dokploy/export.mjs")], cwd=ROOT, check=True)
    entries, expected = [], {}
    with zipfile.ZipFile(ROOT / "downloads/frankenstein-dokploy.zip") as archive:
        for name in sorted(archive.namelist()):
            path = pathlib.PurePosixPath(name)
            if path.parts[0] != "Frankenstein" or ".." in path.parts:
                raise ValueError("Chemin d'archive invalide.")
            relative = str(path.relative_to("Frankenstein"))
            if name.endswith("/"):
                continue
            if any(part in {".git", ".agents", ".local", "node_modules", "attached_assets"} for part in path.parts):
                raise ValueError("Données locales interdites dans la livraison.")
            content = archive.read(name)
            expected[relative] = hashlib.sha1(b"blob " + str(len(content)).encode() + b"\0" + content).hexdigest()
            entry = {"path": relative, "mode": "100644", "type": "blob"}
            try:
                entry["content"] = content.decode("utf-8")
            except UnicodeDecodeError:
                entry["sha"] = api("git/blobs", {
                    "content": base64.b64encode(content).decode(), "encoding": "base64",
                })["sha"]
            entries.append(entry)
    tree = api("git/trees", {"base_tree": base_tree, "tree": entries})["sha"]
    actual_tree = api(f"git/trees/{tree}?recursive=1")
    if actual_tree.get("truncated"):
        raise RuntimeError("Arbre distant tronqué : livraison non confirmée.")
    actual = {item["path"]: item["sha"] for item in actual_tree["tree"] if item["type"] == "blob"}
    if any(actual.get(path) != sha for path, sha in expected.items()):
        raise RuntimeError("Le contenu distant diffère de l'archive : branche non créée.")
    commit = api("git/commits", {
        "message": "Prepare paper-only Frankenstein delivery for Dokploy",
        "tree": tree, "parents": [base],
    })["sha"]
    # POST crée une référence absente ; aucune mise à jour forcée de branche.
    api("git/refs", {"ref": f"refs/heads/{branch}", "sha": commit})
    print(json.dumps({"branch": branch, "commit": commit, "verified_files": len(expected),
                      "main_unchanged": api("git/ref/heads/main")["object"]["sha"] == base}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch", default="dokploy-paper")
    arguments = parser.parse_args()
    publish(arguments.branch)
